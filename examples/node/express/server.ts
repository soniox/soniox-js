import express from 'express'
import { SonioxNodeClient, SonioxNodeOptions } from '@soniox/node';

const app = express()
const port = 3000

const sonioxOptions: SonioxNodeOptions = {}

const soniox = new SonioxNodeClient();

app.get('/', (req, res) => {
    res.send('Hello World!')
})

app.listen(port, () => {
    console.log(`Soniox Express Example app listening on port ${port}`)
})