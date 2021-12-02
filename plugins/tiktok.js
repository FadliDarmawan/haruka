let fetch = require('node-fetch')
let handler = async(m, { conn, usedPrefix, args, command }) => {
    if (!args[0]) throw `Harap masukkan URL sebagai parameter\n\nContoh: ${usedPrefix + command} https://vt.tiktok.com/ZSeDmCuF5/`
    let res = await fetch(global.API('rey', '/api/download/tiktok', { url: args[0] }, 'apikey'))
    if (!res.ok) throw global.error
    let json = await res.json()
    await conn.sendFile(m.chat, json.result.nowatermark, 'tiktok.mp4', watermark, m)
}
handler.command = /^(tiktok|tkdl|ttdl|tdl|tt)$/i
module.exports = handler