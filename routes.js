import { Router } from 'express';
import { connectToWapp, disconnectFromWapp, sendTestMessage, sendImageAlone, sendImageMessage, getStatus } from './wappFunctions.ts';
import multer from 'multer';
import QRCode from 'qrcode';

const upload = multer();
const router = Router();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

router.post('/create-session',upload.none(), async (req, res) => {
    const sender = req.body.sender;
    const descricao = req.body.descricao;
    
    console.log('entrou no create-session');
    
    res.status(200).json({
            status: true,
            message: 'criado'});
});

router.post('/qr-code', upload.none(), async (req, res) => {
    try {
        const { sender } = req.body;
        console.log(sender);

        const { qrcode, status } = await connectToWapp(sender, { waitForQr: true });
        console.log(status);
        if (status == 'connected'){
            res.status(200).json({
                status: 'true',
                message: 'sucesso',
                qrcodigo: qrcode,
                qrcode: '0',
                ativo: 'OK'
            });
            return;
        }
        //console.log(qrcode);
        //console.log(qrUrl);
        const qrUrl = await QRCode.toDataURL(qrcode);
        res.status(200).json({
            status: 'true',
            message: 'sucesso', 
            qrcodigo: qrcode,
            qrcode: qrUrl,
            ativo: ''
        });
    } catch (error) {
        console.error(error);

        res.status(500).json({
            success: false,
            message: 'Erro ao conectar WhatsApp'
        });
    }
});

router.post('/sessao-ativa',upload.none(), async (req, res) =>{
    const { sender } = req.body;
    const status = await getStatus(sender);
    console.log(status)
    if (status == 'connected'){
        res.status(200).json({
            status: true,
            message:"ativado",
            sender
        });
    }else if (status == undefined){
        res.status(422).json({
            status: false,
            message:"inexistente",
            sender
        });
    }else {
        res.status(500).json({
            status: false,
            message:"internal server error",
            sender
        });
    }
});

router.post('/logout-session',upload.none(), async (req, res) => {
    try {
        const { sender } = req.params;

        const isDisconnected = await disconnectFromWapp(sender);
        console.log(isDisconnected)

        if (!isDisconnected) {
            return res.status(500).json({
                status: true,
                message: 'encerrado',
                sender
            });
        }

        res.json({
            success: true,
            sender
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