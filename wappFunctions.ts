import makeWASocket, { DisconnectReason, useMultiFileAuthState, type WASocket } from '@whiskeysockets/baileys'
import { Boom } from '@hapi/boom'
import qrcode from 'qrcode-terminal'
import { rm } from 'node:fs/promises'

const activeSockets = new Map<string, WASocket>()

function sessionPath(sessionId: string) {
    return `sessions/${sessionId}`
}

async function createSocket(sessionId: string) {
    const { state, saveCreds } = await useMultiFileAuthState(sessionPath(sessionId))
    const sock = makeWASocket({
        auth: state
    })

    return { sock, saveCreds }
}

export async function connectToWapp(sessionId: string) {
    const existingSocket = activeSockets.get(sessionId)
    if (existingSocket) {
        return existingSocket
    }

    const { sock, saveCreds } = await createSocket(sessionId)
    activeSockets.set(sessionId, sock)

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update
        if (qr) {
            qrcode.generate(qr, { small: true })
        }
        if (connection === 'close') {
            const shouldReconnect =
                (lastDisconnect?.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut
            console.log('connection closed due to', lastDisconnect?.error, ', reconnecting:', shouldReconnect)
            if (activeSockets.get(sessionId) === sock) {
                activeSockets.delete(sessionId)
            }
            if (shouldReconnect) {
                connectToWapp(sessionId).catch(console.error)
            }
        } else if (connection === 'open') {
            console.log('opened connection')
        }
    })

    sock.ev.on('creds.update', saveCreds)
    return sock
}

export async function disconnectFromWapp(sessionId: string) {
    const existingSocket = activeSockets.get(sessionId)
    const sock = existingSocket ?? (await createSocket(sessionId)).sock
    let disconnected = false

    try {
        await sock.waitForSocketOpen()
        await sock.logout('User requested disconnect')
        disconnected = true
    } catch (err) {
        console.error('Erro ao desconectar:', err)
    } finally {
        if (activeSockets.get(sessionId) === sock) {
            activeSockets.delete(sessionId)
        }
        await rm(sessionPath(sessionId), { recursive: true, force: true })
    }

    return disconnected
}

export async function sendTestMessage(sessionId: string, phone: string, message: string) {
    try {
        const sock = activeSockets.get(sessionId) ?? await connectToWapp(sessionId)
        await sock.waitForSocketOpen()

        phone = '55'+phone+'@s.whatsapp.net'

        const content = { text: message }
        const njid = '555189621990@s.whatsapp.net'
        let success = await sock.sendMessage(njid, content)

        return {messageSent: true, error: 0}

    } catch (err) {
        console.error('Erro ao enviar mensagem de teste:', err)
        return {messageSent: false, error: err}
    }
}

export async function sendImageAlone(sessionId: string, phone: string, media: string) {
    try {
        const sock = activeSockets.get(sessionId) ?? await connectToWapp(sessionId)
        await sock.waitForSocketOpen()

        phone = '55'+phone+'@s.whatsapp.net'

        const content = { image: {url: media} }
        const njid = phone
        await sock.sendMessage(njid, content)

        return {messageSent: true, error: 0}

    } catch (err) {
        console.error('Erro ao enviar mensagems de teste:', err,'\n')
        return {messageSent: false, error: err}
    }
}

export async function sendImageMessage(sessionId: string, message:string, phone: string, media: string) {
    try {
        console.log(sessionId, message, phone, media)
        const sock = activeSockets.get(sessionId) ?? await connectToWapp(sessionId)
        await sock.waitForSocketOpen()

        phone = '55'+phone+'@s.whatsapp.net'
        
        const content = { image: {url: media}, caption: message}
        const njid = phone
        await sock.sendMessage(njid, content)

        return {messageSent: true, error: 0}
        
    } catch (err) {
        console.error('Erro ao enviar mensagems de teste:', err)
        return {messageSent: false, error: err}
    }
}