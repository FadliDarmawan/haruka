let fetch = require('node-fetch')
const { default: makeWASocket, BufferJSON, WA_DEFAULT_EPHEMERAL, generateWAMessageFromContent, downloadContentFromMessage, downloadHistory, proto, getMessage, generateWAMessageContent } = require('@adiwajshing/baileys-md')
let handler = async(m, { conn, usedPrefx, args, command }) => {
    let haruno = await(await fetch('https://telegra.ph/file/9ef75e61a476bec8ebcbf.jpg')).buffer()
    // this.getFile('https://telegra.ph/file/9ef75e61a476bec8ebcbf.jpg')
    let name = conn.getName(m.sender)
    // let user = db.data.users[m.sender]
    let haru = `
*${conn.user.name}
Hai, *${name}*

Berikut list menu Haruno Bot BETA.

Panduan:
Format command Haruno Bot
<test> adalah wajib di isi/lakukan
[] adalah query tambahan, jika tidak ada bot akan menganggap pilihan default
() tidak masuk command, sekedar informasi

contoh command full:
.yt mp4 https://youtu.be/ut1ZYck5qZo

contoh command biasa:
.yt https://youtu.be/ut1ZYck5qZo

reply: mereply sesuatu lalu ketik command
caption: upload media dengan caption command
url: link yang ingin dieksekusi
query: parameter. semisal query pinterest adalah gambar apa yang kalian ingin cari

kendala? hubungi owner.

┌─〔 Stiker 〕
├ ${usedPrefx}sticker <reply/caption gambar>
│ ${usedPrefx}toimg <reply sticker>
├ ${usedPrefx}tovideo <reply sticker gif>
├ ${usedPrefx}togif <reply sticker gif>
├ ${usedPrefx}sgif <reply gif/video>
└────

┌─〔 Downloader 〕
├ ${usedPrefx}yt [mp3/mp4] <url>
│ ${usedPrefx}ig <url>
├ ${usedPrefx}tiktok <url>
├ ${usedPrefx}fb
├ ${usedPrefx}nh <code> (nsfw)
└────

┌─〔 Group 〕
├ ${usedPrefx}group <buka/tutup>
├ ${usedPrefx}setProfileGroup <reply/caption gambar>
├ ${usedPrefx}setDescGroup <text>
├ ${usedPrefx}set <wel/bye> <text>
├ ${usedPrefx}koshigaoka (hashigaoka kansehoshi)
└────

┌─〔 Internet 〕
├ ${usedPrefx}tr [language id] <text/reply text>
│ ${usedPrefx}lirik <judul>
├ ${usedPrefx}judul <reply audio>
├ ${usedPrefx}play <query>
├ ${usedPrefx}pinterest <query>
└────

┌─〔 Information 〕
├ ${usedPrefx}owner 
│ ${usedPrefx}harukya (information)
├ ${usedPrefx}groupinfo (hanya dapat digunakan di group)
├ ${usedPrefx}userinfo 
├ ${usedPrefx}botinfo
├ ${usedPrefx}ping
├ ${usedPrefx}menu
└────

*HARUNO BOT BETA 0.1*
`.trim()
    const template = generateWAMessageFromContent(m.chat, proto.Message.fromObject({
        templateMessage: {
            hydratedTemplate: {
                locationMessage: { degreesLatitude: 0, degreesLongtitude: 0, jpegThumbnail: haruno },
                hydratedContentText: haru,
                hydratedButtons: [{
                    urlButton: {
                        displayText: 'Haruno Bot',
                        url: 'https://github.com/FadliDarmawan/haruno'
                    }
                }, {
                    callButton: {
                        displayText: 'Haruno Bot',
                        phoneNumber: '+62 882-9202-4190'
                    }
                }, {
                    quickReplyButton: {
                        displayText: 'Menu',
                        id: '.menu'
                    }
                }, {
                    quickReplyButton: {
                        displayText: 'Owner',
                        id: '.creator'
                    }  
                }, {
                    quickReplyButton: {
                        displayText: 'Syarat Ketentuan',
                        id: '.snk'
                    }
                }]
            }
        }
    }), { userJid: m.chat, quoted: m })
    console.log(template)
    conn.relayMessage(m.chat, template.message, { messageId: template.key.id })
}
handler.command = /^(menu|?|help|haruno)$/i
module.exports = handler