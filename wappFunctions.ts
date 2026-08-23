import makeWASocket, { DisconnectReason, useMultiFileAuthState, type WASocket } from '@whiskeysockets/baileys'
import { Boom } from '@hapi/boom'
import terminalQrcode from 'qrcode-terminal'
import { rm } from 'node:fs/promises'

const activeSockets = new Map<string, WASocket>()
const sessionQrCodes = new Map<string, string>()
const sessionConnectionStates = new Map<string, 'connecting' | 'open' | 'close'>()
const qrWaiters = new Map<string, Array<(qrcode: string | null) => void>>()

type ConnectToWappOptions = {
    waitForQr?: boolean
    qrTimeoutMs?: number
}

function sessionPath(sessionId: string) {
    return `sessions/${sessionId}`
}

function resolveQrWaiters(sessionId: string, qrcode: string | null) {
    const waiters = qrWaiters.get(sessionId)
    if (!waiters) {
        return
    }

    qrWaiters.delete(sessionId)
    for (const resolve of waiters) {
        resolve(qrcode)
    }
}

function publishQrCode(sessionId: string, qrcode: string) {
    sessionQrCodes.set(sessionId, qrcode)
    resolveQrWaiters(sessionId, qrcode)
}

function waitForQrCode(sessionId: string, timeoutMs = 30000) {
    const existingQrCode = sessionQrCodes.get(sessionId)
    if (existingQrCode) {
        return Promise.resolve(existingQrCode)
    }

    if (sessionConnectionStates.get(sessionId) === 'open') {
        return Promise.resolve(null)
    }

    return new Promise<string | null>((resolve) => {
        const timeoutRef: { current?: ReturnType<typeof setTimeout> } = {}
        const resolveOnce = (qrcode: string | null) => {
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current)
            }
            resolve(qrcode)
        }

        timeoutRef.current = setTimeout(() => {
            const waiters = qrWaiters.get(sessionId) ?? []
            const remainingWaiters = waiters.filter((waiter) => waiter !== resolveOnce)
            if (remainingWaiters.length > 0) {
                qrWaiters.set(sessionId, remainingWaiters)
            } else {
                qrWaiters.delete(sessionId)
            }
            resolve(null)
        }, timeoutMs)

        const waiters = qrWaiters.get(sessionId) ?? []
        waiters.push(resolveOnce)
        qrWaiters.set(sessionId, waiters)
    })
}

async function createSocket(sessionId: string) {
    const { state, saveCreds } = await useMultiFileAuthState(sessionPath(sessionId))
    const sock = makeWASocket({
        auth: state
    })

    return { sock, saveCreds }
}

export async function connectToWapp(sessionId: string, options: ConnectToWappOptions = {}) {
    const existingSocket = activeSockets.get(sessionId)
    if (existingSocket) {
        const qrcode = options.waitForQr
            ? await waitForQrCode(sessionId, options.qrTimeoutMs)
            : sessionQrCodes.get(sessionId) ?? null

        return { sock: existingSocket, qrcode }
    }

    const { sock, saveCreds } = await createSocket(sessionId)
    activeSockets.set(sessionId, sock)
    sessionConnectionStates.set(sessionId, 'connecting')

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update
        if (qr) {
            terminalQrcode.generate(qr, { small: true })
            publishQrCode(sessionId, qr)
        }
        if (connection === 'close') {
            sessionConnectionStates.set(sessionId, 'close')
            sessionQrCodes.delete(sessionId)
            resolveQrWaiters(sessionId, null)
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
            sessionConnectionStates.set(sessionId, 'open')
            sessionQrCodes.delete(sessionId)
            resolveQrWaiters(sessionId, null)
            console.log('opened connection')
        }
    })

    sock.ev.on('creds.update', saveCreds)
    const qrcode = options.waitForQr
        ? await waitForQrCode(sessionId, options.qrTimeoutMs)
        : sessionQrCodes.get(sessionId) ?? null

    return { sock, qrcode }
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
        const sock = activeSockets.get(sessionId) ?? (await connectToWapp(sessionId)).sock
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
        const sock = activeSockets.get(sessionId) ?? (await connectToWapp(sessionId)).sock
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
        const sock = activeSockets.get(sessionId) ?? (await connectToWapp(sessionId)).sock
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