import { Router } from 'express';
import { connectToWapp, disconnectFromWapp, sendMessage, sendImageAlone, sendImageMessage, getStatus, reconectSessions } from './wappFunctions.ts';
import multer from 'multer';
import QRCode from 'qrcode';

const upload = multer();
const router = Router();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

reconectSessions();
//console.log(teste);


router.post('/create-session',upload.none(), async (req, res) => {
    const sender = req.body.sender;
    const descricao = req.body.descricao;
    
    console.log('entrou no create-session');
    
    return res.status(200).json({
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
            return res.status(200).json({
                status: 'true',
                message: 'sucesso',
                qrcodigo: qrcode,
                qrcode: '0',
                ativo: 'OK'
            });
            return;
        }

        const qrUrl = await QRCode.toDataURL(qrcode);
        return res.status(200).json({
            status: 'true',
            message: 'sucesso', 
            qrcodigo: qrcode,
            qrcode: qrUrl,
            ativo: ''
        });
    } catch (error) {
        console.error(error);

        return res.status(500).json({
            success: false,
            message: 'Erro ao conectar WhatsApp'
        });
    }
});

router.post('/sessao-ativa',upload.none(), async (req, res) =>{
    const { sender } = req.body;
    const status = await getStatus(sender);
    console.log('Status: ',status, 'Sessão: ',sender)
    if (status == 'connected'){
        return res.status(200).json({
            status: true,
            message:"ativado",
            sender
        });
    }else if (status == undefined){
        let reconnect = await connectToWapp(sender)
        console.log('reconect status: ',reconnect.status)
        if (reconnect.status == 'connected'){
            return res.status(200).json({
                status: true,
                message:"ativado",
                sender
            });
        }
        return res.status(422).json({
            status: false,
            message:"inexistente",
            sender
        });
    }else {
        return res.status(500).json({
            status: false,
            message:"internal server error",
            sender
        });
    }
});

router.post('/logout-session',upload.none(), async (req, res) => {
    try {
        const { sender } = req.body;

        if (!sender) {
            return res.status(400).json({
                status: false,
                message: 'sender obrigatório'
            });
        }

        const isDisconnected = await disconnectFromWapp(sender);
        console.log(isDisconnected)

        if (!isDisconnected) {
            console.log('isDisconnected: ',isDisconnected)
            return res.status(500).json({
                status: false,
                message: 'Erro ao encerrar',
                sender
            });
        }
        console.log('encerrado')
        return res.status(200).json({
            status: true,
            message: 'encerrado',
            sender
        })
    } catch (error) {
        console.error(error)

        return res.status(500).json({
            success: false,
            message: 'Erro ao desconectar',
            error: error instanceof Error ? error.message : String(error)
        })
    }
})

router.post('/send-message',upload.none(), async (req, res) => {
    try{
        const {sender, number, message} = req.body;

        let {messageSent, error, success} = await sendMessage(sender, number, message)

        if (!messageSent) {
            if(error == 1006){
                await sleep(2000)

                let {messageSent, error, success} = await sendMessage(sender, number, message)
                
                if (error == 0){
                    console.log("Mensagem enviada!")
                    return res.status(200).json({
                        status: true,
                        sender,
                        success
                    })
                }
            }
            return res.status(500).json({
                status: false,
                message: 'Erro ao enviar mensagem',
                sender,
                content: message,
                error
            })
        }
        
        console.log("Mensagem enviada!")
        return res.status(200).json({
            status: true,
            sender
        })
    }catch  (err){
        console.log(err)
        return res.status(500).json({
            status: false,
            message: 'Erro ao enviar mensagem',
            error: err.message
        })
    }
})

router.post('/send-media',upload.none(), async (req, res) => {
    try{
        const {sender, number, mimetype, file64} = req.body;
        let {caption} = req.body;

        var cpt = caption.toLowerCase();
        if (cpt.indexOf(".jpg")>0 || cpt.indexOf(".png")>0 || cpt.indexOf(".bmp")>0 || cpt.indexOf(".jpeg")>0 || cpt.indexOf(".gif")>0)
        {
            caption = "";
        }

        let {messageSent, error} = await sendImageAlone(sender, number, file64, mimetype, caption)
        if (!messageSent) {
            if (error == 1006){
                console.log('Sleeping...')
                await sleep(2000)
                let {messageSent, error} = await sendImageAlone(sender, number, file64, mimetype, caption)
                if (error == 0){
                    console.log("Anexo enviado 2!")
                    return res.status(200).json({
                        status: true,
                        sender
                    })
                }
                return res.status(500).json({
                    status: false,
                    message: 'Erro ao enviar mensagem',
                    sender
                })
            }
        }
        if (!messageSent){
            return res.status(500).json({
                status: false,
                message: 'Erro ao enviar mensagem.',
                sender
            });
        }else{
            console.log("Anexo enviado 1!");
            return res.status(200).json({
                status: true,
                sender
            });
        }
    }catch  (err){
        console.log(err);
        return res.status(500).json({
            status: false,
            message: 'Erro ao enviar mensagem',
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
