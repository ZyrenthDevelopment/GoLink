import * as dotenv from 'dotenv';
import * as fs from 'fs';
import { fileURLToPath } from 'node:url';

import axios from 'axios';

import express from 'express';
import { createServer } from 'http';

import session from 'express-session';
import JSession from 'express-session-json';
import { initDB } from './Utilities/Database.js';
import { log } from './Utilities/Logger.js';
const JsonStore = JSession(session);

const __dirname = fileURLToPath(new URL('.', import.meta.url));
dotenv.config({ path: __dirname + '/.env' });

const config = JSON.parse(fs.readFileSync(__dirname + '/config.json', 'utf-8'));

const app = express();

app.use(express.json());

const httpServer = createServer(app);

// Starting webserver and socket
httpServer.listen(8900, () => {
    console.log(`Listening on port: 8900`);
});

const database = await initDB();

// await client.del('test');

const startupCheckResult = await database.has('links', 'all');

if (!startupCheckResult) {
    await database.create('links', 'all', {
        'zyrenth': {
            code: 'zyrenth',
            type: 'none',
            url: 'https://github.com/Zyrenth'
        }
    });
}

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

app.get('/admin', adminOnly, isAuthenticated, async (req, res, next) => {
    const links = await database.get('links', 'all') as unknown as any;
    delete links.id;

    res.render(`${__dirname}/../views/dashboard.ejs`, { access_token: req.session.user['access_token'], id: 'None', type: 'none', users: [], password: '', views: [], links: Object.keys(links) });
});

app.get('/admin/:id', adminOnly, isAuthenticated, async (req, res, next) => {
    const links = await database.get('links', 'all') as unknown as any;
    delete links.id;
    const link = links[req.params.id];

    res.render(`${__dirname}/../views/dashboard.ejs`, { access_token: req.session.user['access_token'], id: link?.code ?? 'Unknown', type: link?.type ?? 'none', users: link?.users ?? [], password: link?.password ?? '', views: link?.views ?? [], links: Object.keys(links) });
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

app.delete('/api/v1/link', endpoint, adminOnly, isAuthenticated, async (req, res) => {
    const body = req.body;
    let links = await database.get('links', 'all') as unknown as any;
    delete links.id;
    
    delete links[body.id];

    await database.update('links', 'all', links);

    return res.send({ success: true });
});

app.post('/api/v1/link', endpoint, adminOnly, isAuthenticated, async (req, res) => {
    const body = req.body;
    const links = await database.get('links', 'all') as unknown as any;
    delete links.id;

    if (!body.id || !body.type || !body.url) return res.status(400).send({ message: 'Some of the required fields are missing (id, type, url).' });

    if (body.type === 'none') {
        links[body.id] = {
            code: body.id,
            type: 'none',
            url: body.url
        };

        await database.update('links', 'all', links);

        return res.send({ success: true });
    } else if (body.type === 'discord') {
        links[body.id] = {
            code: body.id,
            type: 'discord',
            users: body.users ?? [],
            url: body.url
        };

        await database.update('links', 'all', links);

        return res.send({ success: true });
    } else if (body.type === 'password') {
        links[body.id] = {
            code: body.id,
            type: 'password',
            password: body.password,
            url: body.url
        };

        await database.update('links', 'all', links);

        return res.send({ success: true });
    } else return res.status(400).send({ message: 'Invalid type.' });
});

app.post('/api/v1/links', endpoint, async (req, res) => {
    const body = req.body;
    const links = await database.get('links', 'all') as unknown as any;
    delete links.id;
    
    const link = links[body.id];

    if (!link) return res.status(400).send({ message: 'GoLink not found.' });
    else {
        if (link.type !== body.type) return res.status(400).send({ message: 'Invalid type.' });

        if (link.type === 'password') {
            if (!link.views) link.views = [];
            link.views.push({
                user: 'Anonymus',
                result: link.password === body.password ? 0 : 1,
                date: Date.now()
            });

            links[body.id] = link;
            await database.update('links', 'all', links);

            if (link.password === body.password) return res.send({ url: link.url })
            else return res.status(200).send({ message: 'Invalid password.' });
        } else if (link.type === 'discord') {
            if (!body.token) return res.status(200).send({ message: 'You don\'t have access to this GoLink.' });

            const profile = await getProfile(body.token);

            if (!link.views) link.views = [];

            link.views.push({
                user: `${profile.global_name} | @${profile.username}${profile.discriminator === '0' ? '' : `#${profile.discriminator}`} (${profile.id})`,
                result: link.users.includes(profile.id) ? 0 : 1,
                date: Date.now()
            });

            links[body.id] = link;
            await database.update('links', 'all', links);

            if (!link.users.includes(profile.id)) return res.status(200).send({ message: 'You don\'t have access to this GoLink.' });

            return res.send({ url: link.url });
        } else {
            if (!link.views) link.views = [];
            
            link.views.push({
                user: 'Anonymus',
                result: 0,
                date: Date.now()
            });

            links[body.id] = link;
            await database.update('links', 'all', links);

            return res.send({ url: link.url });
        }
    }
});

app.get('/:id', async (req, res, next) => {
    const id = req.params.id;
    const links = await database.get('links', 'all') as unknown as any;
    delete links.id;
    
    const link = links[id];

    if (!link) return next();

    if (link.type === 'none') {
        if (!link.views) link.views = [];
            
        link.views.push({
            user: 'Anonymus',
            result: 0,
            date: Date.now()
        });

        links[id] = link;
        await database.update('links', 'all', links);

        return res.redirect(link.url);
    } else if (link.type === 'discord') {
        res.render(`${__dirname}/../views/login.ejs`, { loginType: 0, id, access_token: req?.session?.user?.access_token ?? '' });
    } else if (link.type === 'password') {
        res.render(`${__dirname}/../views/login.ejs`, { loginType: 1, id, access_token: '' });
    } else return res.redirect(link.url);
});

app.get('*', (req, res) => {
    res.status(404).render(`${__dirname}/../views/page.ejs`, { access_token: req?.session?.user?.access_token ?? '', title: `Server error`, description: `We can't seem to find ${req.params['0']} in this server, make sure you entered the correct url.` });
});

async function adminOnly(req, res, next) {
    req['__limitedToAdmins'] = true;
    next();
}

async function endpoint(req, res, next) {
    req['__endpoint'] = true;
    next();
}

// Check if Discord OAuth token is valid
async function isAuthenticated(req, res, next) {
    const auth_url = `https://discord.com/api/oauth2/authorize?client_id=${process.env['DISCORD_CLIENT_ID']}&redirect_uri=${encodeURIComponent(process.env['DISCORD_REDIRECT_URL'])}&response_type=code&scope=identify`;

    if (req.session.user) {
        const profile = await getProfile(req.session.user?.access_token);

        if (profile === null) return req['__endpoint'] ? res.status(401).send() : res.redirect(auth_url);
        if (req['__limitedToAdmins'] && !config['admin_users'].includes(profile.id)) {
            if (req['__endpoint']) return res.status(403).send();
            else return res.render(`${__dirname}/../views/page.ejs`, { access_token: req.session.user?.access_token ?? '', title: 'Account error', description: `Hello ${profile.global_name}, in order to access the following resource your account has to be an admin account.` });
        }

        next();
    } else return req['__endpoint'] ? res.status(401).send() : res.redirect(auth_url);
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