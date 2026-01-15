import type { SonioxNodeOptions } from '@soniox/node';
import { SonioxNodeClient } from '@soniox/node';
import express from 'express'

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