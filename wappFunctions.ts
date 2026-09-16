import makeWASocket, { DisconnectReason, useMultiFileAuthState, type WASocket } from '@whiskeysockets/baileys'
import {verifySessions} from './utils.ts'
import { Boom } from '@hapi/boom'
import terminalQrcode from 'qrcode-terminal'
import { rm } from 'node:fs/promises'
import pino from 'pino'
import fs from 'fs/promises'
const sleep = (ms: number): Promise<void> => {return new Promise((resolve) => setTimeout(resolve, ms));};

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

async function verifyExistingNumber(number:string, sock:WASocket){
    const numeroExiste = await sock.onWhatsApp(number);
    if (numeroExiste.length > 1){
        return {exists: false}
    }else{
        return numeroExiste[0]    
    }
}

export async function removeDisconnectedSessions(){
    try{
        const sessions = await verifySessions();
        console.log('Lista de sessões:\n',sessions)
        for(let count of sessions){
            if (count.status != 'connected'){
                fs.rm(`./sessions/${count.directory}`, {recursive: true, force: true})
            }
        }
        return true
    }catch(err){
        console.log(err)
        return false
    }
}
    

export async function reconectSessions(){
    const promises: Promise<string | number>[] = []
    const sessions = await verifySessions()
    console.log(sessions)
    for (const item of sessions){
        promises.push(new Promise((resolve, reject) => {
            connectToWapp(item.directory, { waitForQr: true })
        }));
    }
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
            console.log('Sessão:',sessionId,'Status:', sessionConnectionStates.get(sessionId))
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
        
        const numeroExiste = await verifyExistingNumber(phone, sock);

        if (!numeroExiste?.exists){
            console.log('Numero enviado não existe! ',numeroExiste)
            return {messageSent: false, error: 'Numero nao existe'}
        }
        
        phone = numeroExiste.jid

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

        const numeroExiste = await verifyExistingNumber(phone, sock);

        if (!numeroExiste?.exists){
            console.log('Numero enviado não existe! ',numeroExiste)
            return {messageSent: false, error: 'Numero nao existe'}
        }
        
        const media = Buffer.from(file64, 'base64');
        phone = numeroExiste.jid
        let njid = phone
        const content = { image: {url: media} }
        
        if (mimetype == 'application/pdf'){
            await sock.sendMessage(njid, {document: media, caption});
        }else{
            await sock.sendMessage(njid, {image: media, caption});
        }
        return {messageSent: true, error: 0}
        
    } catch (err:any) {
        console.error('Erro ao enviar anexo:', err,'\n')
        return {messageSent: false, error: err.message}
    }
}

//Em desuso
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
