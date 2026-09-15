import makeWASocket, { DisconnectReason, useMultiFileAuthState, type WASocket } from '@whiskeysockets/baileys'
import { Boom } from '@hapi/boom'
import terminalQrcode from 'qrcode-terminal'
import { rm } from 'node:fs/promises'
import pino from 'pino'
import fs from 'fs'

const activeSockets = new Map<string, WASocket>()
const sessionQrCodes = new Map<string, string>()
type SessionConnectionState =
    | 'connecting'
    | 'waiting_qr'
    | 'connected'
    | 'disconnecting'
    | 'disconnected'
    | 'logged_out'
    | 'unknown'

const sessionConnectionStates = new Map<string, SessionConnectionState>()
const qrWaiters = new Map<string, Array<(qrcode: string | null) => void>>()
const manualDisconnectingSessions = new Set<string>()

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

export async function reconectSessions(){
    const caminho = './sessions'; 
    let sessoes: string[] = []
    const promises: Promise<string | number>[] = []
    
    const itens = await fs.readdir(caminho, { withFileTypes: true }, (err, itens) => {
      if (err) {
        console.error('Erro ao ler a pasta:', err);
        return;
      }
    let count:int = 0;
    itens.forEach(item => {
        if (item.isDirectory()) {
            count++;
            console.log(count);
            
            promises.push(new Promise((resolve, reject) => {
                connectToWapp(item.name, { waitForQr: true })
            }))
            sessoes.push(item.name)
        } else {
            console.log(`[Arquivo] ${item.name}`);
        }
      });
    });
    return {sessoes}
}

async function createSocket(sessionId: string) {
    const { state, saveCreds } = await useMultiFileAuthState(sessionPath(sessionId))
    const sock = makeWASocket({
        auth: state,
        logger: pino({ level: 'silent' })
    })

    return { sock, saveCreds }
}

export async function connectToWapp(sessionId: string, options: ConnectToWappOptions = {}) {
    const existingSocket = activeSockets.get(sessionId)

    if (existingSocket) {
        const status =
            sessionConnectionStates.get(sessionId) ?? 'unknown'

        // Se já estiver conectado, não espera QR
        if (status === 'connected') {
            return {
                sock: existingSocket,
                qrcode: null,
                status
            }
        }

        const qrcode = options.waitForQr
            ? await waitForQrCode(sessionId, options.qrTimeoutMs)
            : sessionQrCodes.get(sessionId) ?? null

        return {
            sock: existingSocket,
            qrcode,
            status: sessionConnectionStates.get(sessionId) ?? 'unknown'
        }
    }

    const { sock, saveCreds } = await createSocket(sessionId)

    activeSockets.set(sessionId, sock)
    sessionConnectionStates.set(sessionId, 'connecting')

    sock.ev.on('connection.update', (update) => {
        const {
            connection,
            lastDisconnect,
            qr
        } = update
        if (connection === 'connecting') {
            sessionConnectionStates.set(sessionId, 'connecting')
        }
        if (qr) {
            sessionConnectionStates.set(sessionId, 'waiting_qr')
            //terminalQrcode.generate(qr, {
            //    small: true
            //})
            publishQrCode(sessionId, qr)
        }
        if (connection === 'open') {
            sessionConnectionStates.set(sessionId, 'connected')
            sessionQrCodes.delete(sessionId)
            resolveQrWaiters(sessionId, null)
            console.log(
                `Sessão ${sessionId}: conectado`
            )
        }
        if (connection === 'close') {
            const statusCode =
                (lastDisconnect?.error as Boom)
                    ?.output?.statusCode
            const isManualDisconnect = manualDisconnectingSessions.has(sessionId)

            const shouldReconnect =
                !isManualDisconnect &&
                statusCode !== DisconnectReason.loggedOut

            if (statusCode === DisconnectReason.loggedOut || isManualDisconnect) {
                sessionConnectionStates.set(
                    sessionId,
                    'logged_out'
                )
            } else {
                sessionConnectionStates.set(
                    sessionId,
                    'disconnected'
                )
            }
            sessionQrCodes.delete(sessionId)
            resolveQrWaiters(sessionId, null)
            if (activeSockets.get(sessionId) === sock) {
                activeSockets.delete(sessionId)
            }
            manualDisconnectingSessions.delete(sessionId)
            if (shouldReconnect) {
                connectToWapp(sessionId)
                    .catch(console.error)
            }
        }
        if(sessionConnectionStates.get(sessionId) != "waiting_qr"){
            console.log('Status atual:', sessionConnectionStates.get(sessionId))
        }
        })
    sock.ev.on('creds.update', saveCreds)
    const qrcode = options.waitForQr
        ? await waitForQrCode(
            sessionId,
            options.qrTimeoutMs
        )
        : sessionQrCodes.get(sessionId) ?? null
    return {
        sock,
        qrcode,
        status:
            sessionConnectionStates.get(sessionId) ??
            'unknown'
    }
}

export async function getStatus(sessionId: string) {
    const status = await sessionConnectionStates.get(sessionId)
    return status
}

export async function disconnectFromWapp(sessionId: string) {
    const existingSocket = activeSockets.get(sessionId)
    const sock = existingSocket ?? (await createSocket(sessionId)).sock
    let disconnected = false

    manualDisconnectingSessions.add(sessionId)
    sessionConnectionStates.set(sessionId, 'disconnecting')
    sessionQrCodes.delete(sessionId)
    resolveQrWaiters(sessionId, null)

    try {
        await sock.waitForSocketOpen()
        await sock.logout('User requested disconnect')
        console.log('Desconectou')
        sessionConnectionStates.set(sessionId, 'logged_out')
        disconnected = true
    } catch (err) {
        console.error('Erro ao desconectar:', err)
        sessionConnectionStates.set(sessionId, 'disconnected')
    } finally {
        if (activeSockets.get(sessionId) === sock) {
            activeSockets.delete(sessionId)
        }
        await rm(sessionPath(sessionId), { recursive: true, force: true })
    }

    return disconnected
}

export async function sendMessage(sessionId: string, phone: string, message: string) {
    try {
        const sock = activeSockets.get(sessionId) ?? (await connectToWapp(sessionId)).sock
        await sock.waitForSocketOpen()

        phone = phone+'@s.whatsapp.net'

        const content = { text: message }
        const njid = phone
        let success = await sock.sendMessage(njid, content)

        return {messageSent: true, error: 0}

    } catch (err) {
        console.error('Erro ao enviar mensagem de teste:', err)
        return {messageSent: false, error: err.message}
    }
}

export async function sendImageAlone(sessionId: string, phone: string, file64: string, mimetype: string, caption: string) {
    try {
        const sock = activeSockets.get(sessionId) ?? (await connectToWapp(sessionId)).sock
        await sock.waitForSocketOpen()

        const media = Buffer.from(file64, 'base64');
        phone = phone+'@s.whatsapp.net'

        const content = { image: {url: media} }
        const njid = phone
        if (mimetype == 'application/pdf'){
            await sock.sendMessage(njid, {
                                   document: media,
                                   caption
                                   });
        }else{
            await sock.sendMessage(njid, {
                                   image: media,
                                   caption
                                   });
        }
        console.log('enviado ao cliente')
        return {messageSent: true, error: 0}

    } catch (err:any) {
        console.error('Erro ao enviar mensagems de teste:', err,'\n')
        return {messageSent: false, error: err.message}
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
        return {messageSent: false, error: err.message}
    }
}
