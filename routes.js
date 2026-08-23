import { Router } from 'express'
import { connectToWapp, disconnectFromWapp, sendTestMessage, sendImageAlone, sendImageMessage } from './wappFunctions.ts'

const router = Router()
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

router.get('/qrcode/:sessionId', async (req, res) => {
    try {
        const { sessionId } = req.params

        const { qrcode } = await connectToWapp(sessionId, { waitForQr: true })

        res.json({
            success: true,
            sessionId,
            qrcode
        })
    } catch (error) {
        console.error(error)

        res.status(500).json({
            success: false,
            message: 'Erro ao conectar WhatsApp'
        })
    }
})

router.post('/disconnect/:sessionId', async (req, res) => {
    try {
        const { sessionId } = req.params;

        const isDisconnected = await disconnectFromWapp(sessionId)

        if (!isDisconnected) {
            return res.status(500).json({
                success: false,
                message: 'Erro ao desconectar',
                sessionId
            })
        }

        res.json({
            success: true,
            sessionId
        })
    } catch (error) {
        console.error(error)

        res.status(500).json({
            success: false,
            message: 'Erro ao desconectar',
            error: error instanceof Error ? error.message : String(error)
        })
    }
})

router.post('/testMessage/:sessionId', async(req,res) =>{
    try{
        const { sessionId } = req.params
        const {phone, message} = req.body;

        let {messageSent, error, success} = await sendTestMessage(sessionId, phone, message)

        if (!messageSent) {
            console.log(error,error == 1006)
            if(error == 1006){
                console.log('sleeping...')
                await sleep(2000)

                let {messageSent, error, success} = await sendTestMessage(sessionId, phone, message)
                
                if (error == 0){
                    res.status(200).json({
                        error: false,
                        status: 'success',
                        sessionId,
                        success
                    })
                }
            }
            return res.status(500).json({
                success: false,
                message: 'Erro ao enviar mensagem de teste',
                sessionId,
                content: message,
                error
            })
        }

        res.status(200).json({
            success: true,
            status: 'success',
            sessionId
        })
    }catch  (err){
        console.log(err)
        res.status(500).json({
            success: false,
            message: 'Erro ao enviar mensagem de teste',
            error: err.message
        })
    }
})

router.post('/sendImageTest/:sessionId', async(req,res) =>{
    try{
        const { sessionId } = req.params
        const {phone, media} = req.body;
        let {messageSent, error} = await sendImageAlone(sessionId, phone, media)

        if (!messageSent) {
            if (error == 1006){
                console.log('Sleeping...')
                await sleep(2000)
                let {messageSent, error} = await sendImageAlone(sessionId, phone, media)
                if (error == 0){
                    res.status(200).json({
                        success: true,
                        status: 'success',
                        sessionId
                    })
                }
                return res.status(500).json({
                    success: false,
                    message: 'Erro ao enviar mensagem de teste',
                    sessionId
                })
            }
        }
        res.status(200).json({
            success: true,
            status: 'success',
            sessionId
        })
    }catch  (err){
        console.log(err)
        res.status(500).json({
            success: false,
            message: 'Erro ao enviar mensagem de teste',
            error: err instanceof Error ? err.message : String(err)
        })
    }
})
router.post('/sendImageMessage/:sessionId', async(req,res) =>{
    try{
        const { sessionId } = req.params
        const {phone, message, media} = req.body;
        let {messageSent, error} = await sendImageMessage(sessionId, message, phone, media)

        if (!messageSent) {
            if (error == 1006){
                console.log('Sleeping...')
                await sleep(2000)
                let {messageSent, error} = await sendImageMessage(sessionId, message, phone, media)
                if (error == 0){
                    res.status(200).json({
                        success: true,
                        status: 'success',
                        sessionId
                    })
                }
                return res.status(500).json({
                    success: false,
                    message: 'Erro ao enviar mensagem de teste',
                    sessionId
                })
            }
        }
        res.status(200).json({
            success: true,
            status: 'success',
            sessionId
        })
    }catch  (err){
        console.log(err)
        res.status(500).json({
            success: false,
            message: 'Erro ao enviar mensagem de teste',
            error: err instanceof Error ? err.message : String(err)
        })
    }
})
export default router