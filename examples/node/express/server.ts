import type { SonioxNodeClientOptions } from '@soniox/node';
import { SonioxNodeClient } from '@soniox/node';
import express from 'express'

const app = express()
const port = 3000

const sonioxOptions: SonioxNodeClientOptions = {}

const soniox = new SonioxNodeClient(sonioxOptions);

app.get('/', (req, res) => {
    res.send('Hello World!')
})

app.get('/tmp-key', async (req, res) => {
    const key = await soniox.auth.createTemporaryKey({
        usage_type: 'transcribe_websocket',
        expires_in_seconds: 3600,
    });
    res.json(key);
});

app.listen(port, () => {
    console.log(`Soniox Express Example app listening on port ${port}`)
})