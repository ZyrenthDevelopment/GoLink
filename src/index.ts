import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'node:url';
import { execSync } from "child_process";

import { createClient } from 'redis';

import axios from 'axios';

import express from 'express';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';

import session from 'express-session';
import JSession from 'express-session-json';
import { Socket } from "socket.io";
import { listenerCount } from 'process';
const JsonStore = JSession(session);

const __dirname = fileURLToPath(new URL('.', import.meta.url));
dotenv.config({ path: __dirname + '/.env' });

const config = JSON.parse(fs.readFileSync(__dirname + '/config.json', 'utf-8'));

const app = express();

app.use(express.json());

const httpServer = createServer(app);
const io = new SocketIOServer(httpServer, {
    cors: {
        origin: 'http://192.168.8.206:8900',
        methods: ['GET', 'POST'],
    },
});

// Starting webserver and socket
httpServer.listen(8900, () => {
    console.log(`Listening on port: 8900`);
});

io.listen(httpServer);

/* const client = createClient({
    database: 1
});

client.on('error', err => console.log('[Redis Client Error]', err));

await client.connect();

await client.hSet('test', {
    'status': 'boring object'
});

const result = await client.hGetAll('test'); */

const links = [
    {
        code: 'noauth',
        type: 'none',
        url: 'https://github.com/Zyrenth'
    },
    {
        code: 'discord',
        type: 'discord',
        users: ['509018277549309962'],
        url: 'https://github.com/Zyrenth'
    },
    {
        code: 'password',
        type: 'password',
        password: 'psswrd',
        url: 'https://github.com/Zyrenth'
    }
];

app.use(express.static('public'));
app.set('view engine', 'ejs');

app.use(session({
    secret: 'secret',
    resave: false,
    saveUninitialized: true,
    store: new JsonStore({
        path: `${__dirname}/..`
    })
}));

app.get('/', isAuthenticated, (req, res, next) => {
    res.render(`${__dirname}/../views/page.ejs`, { access_token: req.session.user['access_token'], title: 'GoLink', description: 'Welcome to the GoLink homepage.' });
});

app.get('/account/login', async (req, res) => {
    res.redirect(`https://discord.com/api/oauth2/authorize?client_id=${process.env['DISCORD_CLIENT_ID']}&redirect_uri=${encodeURIComponent(process.env['DISCORD_REDIRECT_URL'])}&response_type=code&scope=identify`);
});

app.get('/account/logout', isAuthenticated, async (req, res, next) => {
    await new Promise<void>((resolve, reject) => {
        req.session.destroy(function (err) {
            reject(err);
        });

        resolve();
    });

    res.redirect('/');
});

app.get('/account/auth', async (req, res, next) => {
    const code = req.query.code;
    try {
        const response = await axios.post('https://discord.com/api/v10/oauth2/token', {
            client_id: process.env['DISCORD_CLIENT_ID'],
            client_secret: process.env['DISCORD_CLIENT_SECRET'],
            grant_type: 'authorization_code',
            code: code,
            redirect_uri: process.env['DISCORD_REDIRECT_URL'],
        },
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            });

        const { access_token, token_type, refresh_token } = response.data;

        //const profile = await getProfile(access_token);

        // TODO: admin panel
        // if (!config['admin_users'].includes(profile.id)) return res.render(`${__dirname}/../views/page.ejs`, { access_token, title: 'Account error', description: `Hello ${profile.global_name}, in order to access the following resource your account has to be an admin account or it has to be whitelisted.` });

        req.session.user = {
            access_token,
            token_type,
            refresh_token
        };

        res.redirect('/');
    } catch (error) {
        return res.render(`${__dirname}/../views/page.ejs`, { access_token: '', title: `Server error`, description: `Something went wrong while communicating with Discord.` });
    };
});

app.post('/api/v1/links', async (req, res) => {
    const body = req.body;
    const link = links.find(x => x.code === body.id);

    if (!link) return res.status(400).send({ message: 'GoLink not found.' });
    else {
        if (link.type !== body.type) return res.status(400).send({ message: 'Invalid type.' });

        if (link.type === 'password') return link.password === body.password ? res.send({ url: link.url }) : res.status(200).send({ message: 'Invalid password.' });
        else if (link.type === 'discord') {
            if (!body.token) return res.status(200).send({ message: 'You don\'t have access to this GoLink.' });

            const profile = await getProfile(body.token);

            if (!link.users.includes(profile.id)) return res.status(200).send({ message: 'You don\'t have access to this GoLink.' });

            return res.send({ url: link.url });
        } else return res.send({ url: link.url });
    }
});

app.get('/:id', (req, res, next) => {
    const id = req.params.id;
    const link = links.find(x => x.code === id);

    if (!link) return next();

    if (link.type === 'none') return res.redirect(link.url);
    else if (link.type === 'discord') {
        res.render(`${__dirname}/../views/login.ejs`, { loginType: 0, id, access_token: req?.session?.user?.access_token ?? '' });
    } else if (link.type === 'password') {
        res.render(`${__dirname}/../views/login.ejs`, { loginType: 1, id, access_token: '' });
    } else return res.redirect(link.url);
});

app.get('*', (req, res) => {
    res.status(404).render(`${__dirname}/../views/page.ejs`, { title: `Server error`, description: `We can't seem to find ${req.params['0']} in this server, make sure you entered the correct url.` });
});

// Socket event listeners
io.use(async (socket, next) => {
    if (socket.handshake.query && socket.handshake.query.token) {
        const profile = await getProfile(socket.handshake.query.token);

        if (profile === null) return socket.disconnect();

        if (!config['admin_users'].includes(profile.id)) return socket.disconnect();

        next();
    } else {
        socket.disconnect();
    };
}).on('connection', (socket: Socket) => {
    // Discord OAuth profile
    socket.on('get_profile', async () => {
        socket.emit('get_profile', await getProfile(socket.handshake.query.token));
    });

    // Disconnect event
    socket.on('disconnect', () => {
        // log('Socket disconnected.');
    });
});


async function adminOnly(req, res, next) {
    req['__limitedToAdmins'] = true;
    next();
}

// Check if Discord OAuth token is valid
async function isAuthenticated(req, res, next) {
    const auth_url = `https://discord.com/api/oauth2/authorize?client_id=${process.env['DISCORD_CLIENT_ID']}&redirect_uri=${encodeURIComponent(process.env['DISCORD_REDIRECT_URL'])}&response_type=code&scope=identify`;

    if (req.session.user) {
        const profile = await getProfile(req.session.user.access_token);

        if (profile === null) return res.redirect(auth_url);
        if (req['__limitedToAdmins'] && !config['admin_users'].includes(profile.id)) return res.redirect(auth_url);

        next();
    } else res.redirect(auth_url);
};

// Get Discord profile based on OAuth token
async function getProfile(token) {
    try {
        const response = await axios.get('http://discord.com/api/v10/users/@me',
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Authorization': `Bearer ${token}`
                }
            });

        return response.data;
    } catch (error) {
        return null;
    };
};