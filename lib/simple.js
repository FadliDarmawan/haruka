const {
    default: makeWASocket,
    proto,
    downloadContentFromMessage,
    S_WHATSAPP_NET,
    jidDecode
} = require('@adiwajshing/baileys-md')
const { toAudio, toPTT, toVideo } = require('./converter')
const chalk = require('chalk')
const fetch = require('node-fetch')
const FileType = require('file-type')
const PhoneNumber = require('awesome-phonenumber')
let fs = require('fs')

exports.makeWASocket = (...args) => {
    let conn = makeWASocket(...args)

    conn.decodeJid = (jid) => {
        if (!jid) return jid
        if (/:\d+@/gi.test(jid)) {
            let decode = jidDecode(jid) || {}
            return decode.user && decode.server && decode.user + '@' + decode.server || jid
        } else return jid
    }
    if (conn.user && conn.user.id) conn.user.jid = conn.decodeJid(conn.user.id)
    conn.chats = {}
    conn.contacts = {}

    function updateNameToDb(contacts) {
        if (!contacts) return
        for (let contact of contacts) {
            let id = conn.decodeJid(contact.id)
            if (!id) continue
            let chats = conn.contacts[id]
            if (!chats) chats = { id }
            let chat = {
                ...chats,
                ...({
                    ...contact, id, ...(id.endsWith('@g.us') ?
                        { subject: contact.subject || chats.subject || '' } :
                        { name: contact.notify || chats.name || chats.notify || '' })
                } || {})
            }
            conn.contacts[id] = chat
        }
    }
    conn.ev.on('contacts.upsert', updateNameToDb)
    conn.ev.on('groups.update', updateNameToDb)
    conn.ev.on('group-participants.update', async function updateParticipantsToDb({ id, participants, action }) {
        id = conn.decodeJid(id)
        if (!(id in conn.contacts)) conn.contacts[id] = { id }
        let groupMetadata = await conn.groupMetadata(id) || {}
        for (let participant of participants) {
            participant = conn.decodeJid(participant)
            switch (action) {
                case 'add': {
                    if (participant == conn.user.jid) groupMetadata.readOnly = false
                    let same = (groupMetadata.participants || []).find(user => user && user.id == participant)
                    if (!same) groupMetadata.participants.push({ id, admin: null })
                }
                    break
                case 'remove': {
                    if (participant == conn.user.jid) groupMetadata.readOnly = true
                    let same = (groupMetadata.participants || []).find(user => user && user.id == participant)
                    if (same) {
                        let index = groupMetadata.participants.indexOf(same)
                        if (index !== -1) groupMetadata.participants.splice(index, 1)
                    }
                }
                    break
            }
        }
        conn.contacts[id] = {
            ...conn.contacts[id],
            subject: groupMetadata.subject,
            desc: groupMetadata.desc.toString(),
            metadata: groupMetadata
        }
    })

    conn.ev.on('groups.update', function groupUpdatePushToDb(groupsUpdates) {
        for (let update of groupsUpdates) {
            let id = conn.decodeJid(update.id)
            if (!id) continue
            if (!(id in conn.contacts)) conn.contacts[id] = { id }
            if (!conn.contacts[id].metadata) conn.contacts[id].metadata = {}
            let subject = update.subject
            if (subject) conn.contacts[id].subject = subject
            let announce = update.announce
            if (announce) conn.contacts[id].metadata.announce = announce
        }
    })
    conn.ev.on('chats.upsert', function chatsUpsertPushToDb(chats_upsert) {
        console.log({ chats_upsert })
    })
    conn.ev.on('presence.update', function presenceUpdatePushToDb({ id, presences }) {
        let sender = Object.keys(presences)[0] || id
        let _sender = conn.decodeJid(sender)
        let presence = presences[sender]['lastKnownPresence'] || 'composing'
        if (!(_sender in conn.contacts)) conn.contacts[_sender] = {}
        conn.contacts[_sender].presences = presence
    })

    conn.logger = {
        ...conn.logger,
        info(...args) { console.log(chalk.bold.rgb(57, 183, 16)(`INFO [${chalk.rgb(255, 255, 255)(new Date())}]:`), chalk.cyan(...args)) },
        error(...args) { console.log(chalk.bold.rgb(247, 38, 33)(`ERROR [${chalk.rgb(255, 255, 255)(new Date())}]:`), chalk.rgb(255, 38, 0)(...args)) },
        warn(...args) { console.log(chalk.bold.rgb(239, 225, 3)(`WARNING [${chalk.rgb(255, 255, 255)(new Date())}]:`), chalk.keyword('orange')(...args)) }
    }

    /**
     * getBuffer hehe
     * @param {String|Buffer} path
     */
    conn.getFile = async (path) => {
        let res
        let data = Buffer.isBuffer(path) ? path : /^data:.*?\/.*?;base64,/i.test(path) ? Buffer.from(path.split`,`[1], 'base64') : /^https?:\/\//.test(path) ? await (res = await fetch(path)).buffer() : fs.existsSync(path) ? (res = path, fs.readFileSync(path)) : typeof path === 'string' ? path : Buffer.alloc(0)
        if (!Buffer.isBuffer(data)) throw new TypeError('Result is not a buffer')
        let type = await FileType.fromBuffer(data) || {
            mime: 'application/octet-stream',
            ext: '.bin'
        }
        return {
            res,
            ...type,
            data
        }
    }


    /**
     * waitEvent
     * @param {*} eventName 
     * @param {Boolean} is 
     * @param {Number} maxTries 
     * @returns 
     */
    conn.waitEvent = (eventName, is = () => true, maxTries = 25) => {
        return new Promise((resolve, reject) => {
            let tries = 0
            let on = (...args) => {
                if (++tries > maxTries) reject('Max tries reached')
                else if (is()) {
                    conn.ev.off(eventName, on)
                    resolve(...args)
                }
            }
            conn.ev.on(eventName, on)
        })
    }

    /**
    * Send Media/File with Automatic Type Specifier
    * @param {String} jid
    * @param {String|Buffer} path
    * @param {String} filename
    * @param {String} caption
    * @param {Object} quoted
    * @param {Boolean} ptt
    * @param {Object} options
    */
    conn.sendFile = async (jid, path, filename = '', caption = '', quoted, ptt = false, options = {}) => {
        let type = await conn.getFile(path)
        let { res, data: file } = type
        if (res && res.status !== 200 || file.length <= 65536) {
            try { throw { json: JSON.parse(file.toString()) } }
            catch (e) { if (e.json) throw e.json }
        }
        let opt = { filename, caption }
        if (quoted) opt.quoted = quoted
        if (!type) if (options.asDocument) options.asDocument = true
        let mtype = ''
        if (/webp/.test(type.mime)) mtype = 'sticker'
        else if (/image/.test(type.mime)) mtype = 'image'
        else if (/video/.test(type.mime)) mtype = 'video'
        else if (/audio/.test(type.mime)) {
            file = await (ptt ? toPTT : toAudio)(file, type.ext)
            mtype = 'audio'
        }
        else if (/x-protobuf/.test(type.mime)) mtype = 'history'
        else mtype = 'document'
        return await conn.sendMessage(jid, { ...opt, ...options, ptt, [mtype]: file }, { ...opt, ...options })
    }

    /**
     * Send Contact
     * @param {String} jid 
     * @param {String} number 
     * @param {String} name 
     * @param {Object} quoted 
     * @param {Object} options 
     */
    conn.sendContact = async (jid, number, name, quoted, options) => {
        number = number.replace(/[^0-9]/g, '')
        let njid = number + '@s.whatsapp.net'
        let vcard = `
BEGIN:VCARD
VERSION:3.0
FN:${name.replace(/\n/g, '\\n')}
TEL;type=CELL;type=VOICE;waid=${number}:${PhoneNumber('+' + number).getNumber('international')}
END:VCARD
    `
        return await conn.sendMessage(jid, {
            contacts: {
                displayName: name,
                contacts: [{ vcard }],
                quoted, ...options
            },
            quoted, ...options
        })
    }

    /**
     * Reply to a message
     * @param {String} jid
     * @param {String|Object} text
     * @param {Object} quoted
     * @param {Object} options
     */
    conn.reply = (jid, text = '', quoted, options) => {
        return Buffer.isBuffer(text) ? this.sendFile(jid, text, 'file', '', quoted, false, options) : conn.sendMessage(jid, { quoted, ...options, text }, { quoted, ...options })
    }

    /**
     * send Button
     * @param {String} jid 
     * @param {String} contentText 
     * @param {String} footerText 
     * @param {Buffer|String} buffer 
     * @param {String[]} buttons 
     * @param {Object} quoted 
     * @param {Object} options 
     */
    conn.sendButton = async (jid, contentText, footerText, buffer, buttons, quoted, options) => {
        if (buffer) try { buffer = (await conn.getFile(buffer)).data } catch { buffer = null }
        let message = {
            ...(buffer ? { caption: contentText || '' } : { text: contentText || '' }),
            footerText,
            buttons: buttons.map(btn => {
                return {
                    buttonId: btn[1] || btn[0] || '',
                    buttonText: {
                        displayText: btn[0] || btn[1] || ''
                    }
                }
            }), // [{ buttonId: 'test-1', buttonText: { displayText: 'no' } }, { buttonId: 'test-2', buttonText: { displayText: 'yes' } }]
            ...(buffer ? { image: buffer } : {})
        }
        return await conn.sendMessage(jid, message, {
            quoted,
            upload: conn.waUploadToServer,
            ...options
        })
    }
    /**
     * Download media message
     * @param {Object} m
     */
    conn.downloadM = async (m, type) => {
        if (!m || !(m.url || m.directPath)) return Buffer.alloc(0)
        const stream = await downloadContentFromMessage(m, type)
        let buffer = Buffer.from([])
        for await (const chunk of stream) {
            buffer = Buffer.concat([buffer, chunk])
        }
        return buffer
    }

    /**
     * Read message
     * @param {String} jid 
     * @param {String|undefined|null} participant 
     * @param {String} messageID 
     */
    conn.chatRead = async (jid, participant, messageID) => {
        return await conn.sendReadReceipt(jid, participant, [messageID])
    }

    /**
     * Get name from jid
     * @param {String} jid
     * @param {Boolean} withoutContact
     */
    conn.getName = (jid, withoutContact = false) => {
        jid = conn.decodeJid(jid)
        withoutContact = this.withoutContact || withoutContact
        let v
        if (jid.endsWith('@g.us')) {
            v = conn.contacts[jid] || {}
            if (!(v.name || v.subject))
                v = new Promise(async (resolve) => {
                    return resolve(await conn.groupMetadata(jid) || {})
                })
            if (v instanceof Promise) return v.then(j => (j.name || j.subject || PhoneNumber('+' + jid.replace('@s.whatsapp.net', '')).getNumber('international')))
            else return v.name || v.subject || PhoneNumber('+' + jid.replace('@s.whatsapp.net', '')).getNumber('international')

        }
        else v = jid === '0@s.whatsapp.net' ? {
            jid,
            vname: 'WhatsApp'
        } : jid === conn.user.jid ?
            conn.user :
            (conn.contacts[jid] || {})
        return (withoutContact ? '' : v.name) || v.subject || v.vname || v.notify || v.verifiedName || PhoneNumber('+' + jid.replace('@s.whatsapp.net', '')).getNumber('international')
    }

    conn.saveName = (id, name = '') => {
        if (!id) return
        id = conn.decodeJid(id)
        let chat = { ...(conn.contacts[id] || {}), id, name }
        if (!(id in conn.contacts) || !conn.contacts[id].name) conn.contacts[id] = chat
        if (!(id in conn.chats)) conn.chats[id] = chat
    }

    conn.getBusinessProfile = async (jid) => {
        let id = jidDecode(jid)
        return await conn.query({
            tag: 'ig',
            attrs: {
                to: S_WHATSAPP_NET,
                xmlns: 'w:biz',
                type: "get"
            },
            content: [
                {
                    tag: 'business_profile',
                    attrs: {
                        v: '3',
                    },
                    content: [
                        {
                            tag: 'profile',
                            attrs: {
                                jid,
                                tag,
                            },
                            content: null
                        }
                    ],
                }
            ]
        })
        // const r = (0,
        //     a.wap)("iq", {
        //         to: a.S_WHATSAPP_NET,
        //         xmlns: "w:biz",
        //         id: (0,
        //         a.generateId)(),
        //         type: "get"
        //     }, (0,
        //     a.wap)("business_profile", {
        //         v: (0,
        //         a.INT)(t)
        //     }, e.map((e=>(0,
        //     a.wap)("profile", {
        //         jid: (0,
        //         d.USER_JID)(e.wid),
        //         tag: null != e.tag ? (0,
        //         a.INT)(e.tag) : a.DROP_ATTR
        //     })))))
        //
        //
        // t.INT = function(e) {
        //     return e.toString()
        // }
        // 
        //
        // t.queryBusinessProfile = function(e, t) {
        //     const r = (0,
        //     s.getBusinessProfileQueryVersion)();
        //     let n;
        //     l.default.supportsFeature(l.default.F.MD_BACKEND) ? (n = t ? Promise.all([(0,
        //     d.default)(e, r), (0,
        //     c.getMerchantCompliance)(e)]).then(f) : (0,
        //     d.default)(e, r),
        //     n || (n = Promise.reject(new Error("Should not reach here")))) : n = t ? Promise.all([u.default.queryBusinessProfile(e, r), u.default.queryMerchantCompliance(e)]).then(f) : u.default.queryBusinessProfile(e, r);
        //     return (0,
        //     p.attachErrorLogger)(n, "Query business profile failed")
        // }
        //
        //
        // const s = yield(0,
        // l.queryBusinessProfile)([{
        //     wid: a.id,
        //     tag: a.tag
        // }], r);
        //
        //
        // t.USER_JID = function(e) {
        //     if (!(e instanceof o.default && e.isUser()))
        //         throw Error(`USER_JID: invalid jid type: ${e instanceof o.default ? e.toString() : "Not an instance of WID"}`);
        //     return s.WapJid.create(e.user, i.WA_USER_JID_SUFFIX = 's.whatsapp.net')
        // }

    }
    /**
     * Serialize Message, so it easier to manipulate
     * @param {Object} m
     */
    conn.serializeM = (m) => {
        return exports.smsg(conn, m)
    }

    Object.defineProperty(conn, 'name', {
        value: 'WASocket',
        configurable: true,
    })
    return conn
}
/**
 * Serialize Message
 * @param {WAConnection} conn 
 * @param {Object} m 
 * @param {Boolean} hasParent 
 */
exports.smsg = (conn, m, hasParent) => {
    if (!m) return m
    let M = proto.WebMessageInfo
    if (m.key) {
        m.id = m.key.id
        m.isBaileys = m.id && m.id.length === 16 || false
        m.chat = conn.decodeJid(m.key.remoteJid || m.msg && m.msg.groupId || '')
        m.fromMe = m.key.fromMe
        m.isGroup = m.chat.endsWith('@g.us')
        m.sender = conn.decodeJid(m.participant || m.key.participant || m.chat || '')
    }
    if (m.message) {
        m.mtype = Object.keys(m.message)[0]
        m.msg = m.message[m.mtype]
        m.text = m.msg.text || m.msg.caption || m.msg.contentText || m.msg || ''
        m.mentionedJid = m.msg && m.msg.contextInfo && m.msg.contextInfo.mentionedJid && m.msg.contextInfo.mentionedJid.length && m.msg.contextInfo.mentionedJid || []
        let quoted = m.quoted = m.msg && m.msg.contextInfo && m.msg.contextInfo.quotedMessage ? m.msg.contextInfo.quotedMessage : null
        if (m.quoted) {
            let type = Object.keys(m.quoted)[0]
            m.quoted = m.quoted[type]
            if (typeof m.quoted === 'string') m.quoted = { text: m.quoted }
            m.quoted.mtype = type
            m.quoted.id = m.msg.contextInfo.stanzaId
            m.quoted.chat = conn.decodeJid(m.msg.contextInfo.remoteJid || m.chat || m.sender)
            m.quoted.isBaileys = m.quoted.id && m.quoted.id.length === 16 || false
            m.quoted.sender = conn.decodeJid(m.msg.contextInfo.participant)
            m.quoted.fromMe = m.quoted.sender === conn.user.jid
            m.quoted.text = m.quoted.text || m.quoted.caption || ''
            m.quoted.mentionedJid = m.quoted.contextInfo && m.quoted.contextInfo.mentionedJid && m.quoted.contextInfo.mentionedJid.length && m.quoted.contextInfo.mentionedJid || []

            let vM = m.quoted.fakeObj = M.fromObject({
                key: {
                    fromMe: m.quoted.fromMe,
                    remoteJid: m.quoted.chat,
                    id: m.quoted.id
                },
                message: quoted,
                ...(m.isGroup ? { participant: m.quoted.sender } : {})
            })

            if (m.quoted.url || m.quoted.directPath) m.quoted.download = () => conn.downloadM(m.quoted, m.quoted.mtype.toLowerCase().replace(/message/i, ''))

            /**
             * Reply to quoted message
             * @param {String|Object} text
             * @param {String|false} chatId
             * @param {Object} options
             */
            m.quoted.reply = (text, chatId, options) => conn.reply(chatId ? chatId : m.chat, text, vM, options)

            /**
             * Copy quoted message
             */
            m.quoted.copy = () => exports.smsg(conn, M.fromObject(M.toObject(vM)))

            /**
             * Delete quoted message
             */
            m.quoted.delete = () => conn.sendMessage(m.quoted.chat, { delete: vM.key })
        }
    }
    m.name = m.pushName || conn.getName(m.sender)
    if (m.msg && m.msg.url) m.download = () => conn.downloadM(m.msg, m.mtype.toLowerCase().replace(/message/i, ''))
    /**
     * Reply to this message
     * @param {String|Object} text
     * @param {String|false} chatId
     * @param {Object} options
     */
    m.reply = (text, chatId, options) => conn.reply(chatId ? chatId : m.chat, text, m, options)

    /**
     * Delete this message
     */
    m.delete = () => conn.sendMessage(m.chat, { delete: m.key })
    // console.log({ smsg: m.quoted })
    conn.saveName(m.sender, m.name)
    if (m.msg && m.msg.type == 'REVOKE') conn.ev.emit('message.delete', m.msg)
    return m
}

exports.logic = (check, inp, out) => {
    if (inp.length !== out.length) throw new Error('Input and Output must have same length')
    for (let i in inp) if (util.isDeepStrictEqual(check, inp[i])) return out[i]
    return null
}