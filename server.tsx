#!/usr/bin/env -S pnpm dlx tsx

import fs from 'fs';
import { execSync } from 'child_process';
import path from 'path';

if (!fs.existsSync(path.join(process.cwd(), 'node_modules', 'better-sqlite3'))) {
    console.log('--> Dependencies not found. Creating package.json and installing...');

    // Create a package.json with the pnpm configuration to allow building better-sqlite3.
    const packageJson = {
        name: "appo-runner",
        type: "module",
        pnpm: {
            onlyBuiltDependencies: ["better-sqlite3"]
        }
    };
    fs.writeFileSync('package.json', JSON.stringify(packageJson, null, 2));

    const deps = "react@18.3.1 react-dom@18.3.1 fastify@4.27.0 esbuild@0.21.4 node-fetch@3.3.2 better-sqlite3@12.4.6 @types/node@^20 @types/react@^18 @types/react-dom@^18 @types/better-sqlite3@^7";
    execSync(`pnpm add ${deps}`, { stdio: 'inherit' });

    console.log('--> Dependencies installed. Restarting server...');
    execSync(`pnpm dlx tsx ${process.argv[1]}`, { stdio: 'inherit' });
    process.exit();
}

bootstrap();

async function bootstrap() {
    const fastify = (await import('fastify')).default;
    const React = (await import('react')).default;
    const { renderToString } = await import('react-dom/server');
    const esbuild = (await import('esbuild')).default;
    const fetch = (await import('node-fetch')).default;
    const Database = (await import('better-sqlite3')).default;
    const { Layout, WelcomePage, TodoPage, StarWarsIndexPage, StarWarsMoviePage } = await import('./app.js');

    const db = new Database('appo.db');
    db.exec(`CREATE TABLE IF NOT EXISTS todos (id INTEGER PRIMARY KEY AUTOINCREMENT, text TEXT NOT NULL)`);
    const getAllTodos = db.prepare('SELECT * FROM todos');
    const getTodoById = db.prepare('SELECT * FROM todos WHERE id = ?');
    const insertTodo = db.prepare('INSERT INTO todos (text) VALUES (?)');

    const server = fastify();

    const { outputFiles: [{ text: clientJs }] } = await esbuild.build({
        entryPoints: ['app.tsx'], bundle: true, write: false, format: 'iife'
    });

    server.get('/client.js', (_req, reply) => {
        reply.header('Content-Type', 'application/javascript').send(clientJs);
    });

    server.get('/api/todos', (_req, reply) => {
        reply.send(getAllTodos.all());
    });
    server.post('/api/todos', (req, reply) => {
        const { text } = req.body as { text: string };
        if (!text) return reply.status(400).send({ error: 'Text is required' });
        const info = insertTodo.run(text);
        const newTodo = getTodoById.get(info.lastInsertRowid);
        reply.status(201).send(newTodo);
    });

    const renderPage = (reply: any, PageComponent: React.FC<any>, props: any, url: string) => {
        const appHtml = renderToString(<Layout currentUrl={url}><PageComponent {...props} /></Layout>);
        const html = `<!DOCTYPE html><html><head><title>appo-singlefile</title></head><body>
        <div id="root">${appHtml}</div><script>
        window.__PAGE_NAME__ = "${PageComponent.name}";
        window.__INITIAL_PROPS__ = ${JSON.stringify(props)};
        </script><script src="/client.js"></script></body></html>`;
        reply.header('Content-Type', 'text/html').send(html);
    };

    server.get('/', (req, reply) => renderPage(reply, WelcomePage, {}, req.url));
    server.get('/todo', (req, reply) => renderPage(reply, TodoPage, { initialTodos: getAllTodos.all() }, req.url));
    server.get('/star-wars', async (req, reply) => {
        const res = await fetch("https://brillout.github.io/star-wars/api/films.json");
        const data = await (res.json() as Promise<any[]>);
        const movies = data.map(({ id, title, release_date }) => ({ id, title, release_date }));
        renderPage(reply, StarWarsIndexPage, { movies }, req.url);
    });
    server.get<{ Params: { id: string } }>('/star-wars/:id', async (req, reply) => {
        const { id } = req.params;
        const res = await fetch(`https://brillout.github.io/star-wars/api/films/${id}.json`);
        const movie = await res.json();
        renderPage(reply, StarWarsMoviePage, { movie }, req.url);
    });

    await server.listen({ port: 3000 });
    console.log('--> Server running at http://localhost:3000');
}
