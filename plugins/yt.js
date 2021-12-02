let fetch = require('node-fetch')
let handler = async(m, { conn, usedPrefix, args, command }) => {
    if(!args[1]) throw `Harap masukkan URL sebagai parameter\n\nContoh: ${usedPrefix + command} https://youtu.be/ut1ZYck5qZo`
    if(!args[0]) {
        let res = await fetch(global.API('rey', '/api/download/ytmp4', { url: args[1]}, 'apikey'))
        if (!res.ok) throw global.error
        let json = await res.json()
        await conn.sendFile(m.chat, json.result.url, '', watermark, m)
    } else if (args[0] === 'mp3') {
        let res = await fetch(global.API('rey', '/api/download/ytmp3', { url: args[1]}, 'apikey'))
        if (!res.ok) throw global.error
        let json = await res.json()
        await conn.sendFile(m.chat, json.result.url, '', null, m)
    } else if (args[0] === 'mp4') {
        let res = await fetch(global.API('rey', '/api/download/ytmp4', { url: args[1]}, 'apikey'))
        if (!res.ok) throw global.error
        let json = await res.json()
        await conn.sendFile(m.chat, json.result.url, '', watermark, m)
    }
}
handler.command = /^(yt|ytdl|youtube)$/i
module.exports = handler