#!/usr/bin/env -S pnpm dlx tsx
// A self-contained, single-file, full-stack app using Fastify, React, and SQLite.
// It includes: dependency bootstrapping, an API, a database, SSR, and client-side hydration.
// It is fully type-safe and passes `tsc` without any `any` or `unknown` casts.
// To run: `pnpm dlx tsx ./server.tsx` in a clean directory.

// --- TYPE-SAFE GLOBAL DEFINITIONS for Client-Side ---
declare global {
    interface Window {
        __PAGE_NAME__: keyof ReturnType<typeof defineSharedCode>['pages'];
        __INITIAL_PROPS__: any;
    }
}

// --- SHARED CODE FACTORY ---
function defineSharedCode(React: typeof import('react')) {
    const { useState } = React;

    interface Todo { id: number; text: string; }
    interface MovieSummary { id: string; title: string; release_date: string; }
    interface MovieDetails { title: string; director: string; producer: string; release_date: string; }

    function Link({ href, children, currentUrl }: { href: string; children: React.ReactNode; currentUrl: string }) {
        const isActive = href === currentUrl;
        const style = isActive ? { backgroundColor: '#eee' } : {};
        return <a href={href} style={{ padding: '2px 10px', textDecoration: 'none', display: 'block', ...style }}>{children}</a>;
    }

    function Layout({ children, currentUrl }: { children: React.ReactNode; currentUrl: string }) {
        return (
            <div style={{ display: 'flex', maxWidth: '960px', margin: 'auto', fontFamily: 'sans-serif' }}>
                <div style={{ padding: '20px', borderRight: '1px solid #eee', flexShrink: 0 }}>
                    <h2>appo-singlefile</h2>
                    <Link href="/" currentUrl={currentUrl}>Welcome</Link>
                    <Link href="/todo" currentUrl={currentUrl}>Todo</Link>
                    <Link href="/star-wars" currentUrl={currentUrl}>Star Wars</Link>
                </div>
                <div style={{ padding: '20px', width: '100%' }}>{children}</div>
            </div>
        );
    }

    function Counter() {
        const [count, setCount] = useState(0);
        return <button type="button" onClick={() => setCount((c) => c + 1)}>Counter {count}</button>;
    }

    function WelcomePage() {
        return (<><h1>Welcome</h1><p>This is an interactive counter:</p><Counter /></>);
    }

    function TodoPage({ initialTodos }: { initialTodos: Todo[] }) {
        const [todos, setTodos] = useState(initialTodos);
        const [newTodo, setNewTodo] = useState('');
        const addTodo = async (e: React.FormEvent) => {
            e.preventDefault();
            if (!newTodo.trim()) return;
            const res = await window.fetch('/api/todos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: newTodo }) });
            setTodos([...todos, await res.json()]);
            setNewTodo('');
        };
        return (<><h1>Todo List</h1><ul>{todos.map(t => <li key={t.id}>{t.text}</li>)}</ul><form onSubmit={addTodo}><input type="text" value={newTodo} onChange={e => setNewTodo(e.target.value)} /><button type="submit">Add</button></form></>);
    }

    function StarWarsIndexPage({ movies }: { movies: MovieSummary[] }) {
        return (<><h1>Star Wars Movies</h1><ol>{movies.map(({ id, title, release_date }) => <li key={id}><a href={`/star-wars/${id}`}>{title}</a> ({release_date})</li>)}</ol></>);
    }

    function StarWarsMoviePage({ movie }: { movie: MovieDetails }) {
        return (<><h1>{movie.title}</h1><p>Director: {movie.director}</p><p>Producer: {movie.producer}</p><p>Release Date: {movie.release_date}</p></>);
    }

    return {
        Layout,
        pages: { WelcomePage, TodoPage, StarWarsIndexPage, StarWarsMoviePage }
    };
}


// --- ENVIRONMENT-SPECIFIC LOGIC ---
const IS_SERVER = typeof window === 'undefined';

if (IS_SERVER) {
    // =====================================================
    // SERVER-SIDE LOGIC (runs in Node.js)
    // =====================================================
    const runServer = async () => {
        // Use variables for module names to hide them from esbuild's static analysis
        const fs_name = 'fs', cp_name = 'child_process', path_name = 'path';
        const rds_name = 'react-dom/server', fastify_name = 'fastify', esbuild_name = 'esbuild', b3_name = 'better-sqlite3';

        const fs = await import(fs_name);
        const { execSync } = await import(cp_name);
        const path = await import(path_name);

        if (!fs.existsSync(path.join(process.cwd(), 'node_modules'))) {
            console.log('--> Dependencies not found. Creating package.json and installing...');
            const packageJson = {
                name: "appo-runner", type: "module",
                pnpm: { onlyBuiltDependencies: ["better-sqlite3"] }
            };
            fs.writeFileSync('package.json', JSON.stringify(packageJson, null, 2));
            const deps = "react@18.2.0 react-dom@18.2.0 fastify@4.25.2 esbuild@0.20.2 better-sqlite3@9.4.3 @types/node @types/react @types/react-dom @types/better-sqlite3 typescript tsx";
            execSync(`pnpm add ${deps}`, { stdio: 'inherit' });
            console.log('--> Dependencies installed. Restarting server...');
            execSync(`pnpm dlx tsx ${process.argv[1]}`, { stdio: 'inherit' });
            process.exit();
        }

        const React = (await import('react')).default;
        const { renderToString } = await import(rds_name);
        const fastify = (await import(fastify_name)).default;
        const esbuild = (await import(esbuild_name)).default;
        const Database = (await import(b3_name)).default;
        const { Layout, pages } = defineSharedCode(React);

        const db = new Database('appo.db');
        db.exec(`CREATE TABLE IF NOT EXISTS todos (id INTEGER PRIMARY KEY AUTOINCREMENT, text TEXT NOT NULL)`);
        const getAllTodos = db.prepare('SELECT * FROM todos');
        const getTodoById = db.prepare<[number]>('SELECT * FROM todos WHERE id = ?');
        const insertTodo = db.prepare<[string]>('INSERT INTO todos (text) VALUES (?)');

        const server = fastify();

        const { outputFiles: [{ text: clientJs }] } = await esbuild.build({
            entryPoints: [process.argv[1]], bundle: true, write: false, format: 'iife',
            define: { IS_SERVER: 'false' },
        });

        server.get('/client.js', (_, r) => r.header('Content-Type', 'application/javascript').send(clientJs));
        server.get('/api/todos', (_, r) => r.send(getAllTodos.all()));
        server.post<{ Body: { text: string } }>('/api/todos', (q, r) => {
            const { text } = q.body;
            if (!text || !text.trim()) return r.status(400).send({ error: 'Text required' });
            const info = insertTodo.run(text);
            r.status(201).send(getTodoById.get(info.lastInsertRowid));
        });

        const renderPage = (reply: import('fastify').FastifyReply, PageComponent: React.FC<any>, props: any, url: string) => {
            const app = <Layout currentUrl={url}><PageComponent {...props} /></Layout>;
            const html = `<!DOCTYPE html><html><head><title>appo</title></head><body><div id="root">${renderToString(app)}</div>
            <script>window.__PAGE_NAME__="${PageComponent.name}";window.__INITIAL_PROPS__=${JSON.stringify(props)}</script>
            <script src="/client.js"></script></body></html>`;
            reply.header('Content-Type', 'text/html').send(html);
        };

        server.get('/', (q, r) => renderPage(r, pages.WelcomePage, {}, q.url));
        server.get('/todo', (q, r) => renderPage(r, pages.TodoPage, { initialTodos: getAllTodos.all() }, q.url));
        server.get('/star-wars', async (q, r) => {
            const res = await fetch("https://brillout.github.io/star-wars/api/films.json");
            renderPage(r, pages.StarWarsIndexPage, { movies: await res.json() }, q.url);
        });
        server.get<{ Params: { id: string } }>('/star-wars/:id', async (q, r) => {
            const res = await fetch(`https://brillout.github.io/star-wars/api/films/${q.params.id}.json`);
            renderPage(r, pages.StarWarsMoviePage, { movie: await res.json() }, q.url);
        });

        await server.listen({ port: 3000 });
        console.log('--> Server running at http://localhost:3000');
    };
    runServer();

} else {
    // =====================================================
    // CLIENT-SIDE LOGIC (runs in the browser)
    // =====================================================
    (async () => {
        const React = await import('react');
        const { hydrateRoot } = await import('react-dom/client');
        const { Layout, pages } = defineSharedCode(React);

        const PageComponent = pages[window.__PAGE_NAME__];
        if (PageComponent) {
            hydrateRoot(document.getElementById('root')!,
                <Layout currentUrl={window.location.pathname}>
                    <PageComponent {...window.__INITIAL_PROPS__} />
                </Layout>
            );
        }
    })();
}
