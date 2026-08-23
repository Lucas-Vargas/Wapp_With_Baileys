import express from 'express'
import routes from './routes.js'

const app:any = express()

app.use(express.json())
app.use(routes)

app.listen(3000, () => {
    console.log('Servidor rodando na porta 3000')
})