#!/usr/bin/env -S pnpm dlx tsx
// This is a multi-stage, self-bootstrapping, self-type-checking, single-file full-stack app.

export { }; // Treat as a module for TypeScript correctness.

// This constant is the key to tree-shaking the server code out of the client bundle.
const IS_SERVER = typeof window === 'undefined';
// For rule 16: dev mode check. __build_env_dev__ is injected by esbuild.
declare const __build_env_dev__: boolean;
const __DEV__ = IS_SERVER ? process.env.NODE_ENV !== 'production' : __build_env_dev__;

// --- SHARED TYPES ---
interface Todo { id: number; text: string; }
interface MovieSummary { id: string; title: string; release_date: string; }
interface MovieDetails { title: string; director: string; producer: string; release_date: string; }

// --- SHARED CODE FACTORY (visible to server & client) ---
function defineSharedCode(React: typeof import('react')) {
    const { useState, useEffect } = React;
    type PropsWithChildren<P> = React.PropsWithChildren<P>;
    const Link = ({ href, children, currentUrl }: PropsWithChildren<{ href: string; currentUrl: string }>) => {
        const style = href === currentUrl ? { backgroundColor: '#eee' } : {};
        return <a href={href} style={{ padding: '2px 10px', textDecoration: 'none', ...style }}>{children}</a>;
    };
    const Layout = ({ children, currentUrl }: PropsWithChildren<{ currentUrl: string }>) => (
        <div style={{ display: 'flex', maxWidth: '960px', margin: 'auto' }}>
            <nav style={{ padding: '20px', borderRight: '1px solid #eee' }}>
                <h2>appo-singlefile</h2>
                <Link href="/" currentUrl={currentUrl}>Welcome</Link>
                <Link href="/todo" currentUrl={currentUrl}>Todo</Link>
                <Link href="/star-wars" currentUrl={currentUrl}>Star Wars</Link>
            </nav>
            <main style={{ padding: '20px' }}>{children}</main>
        </div>
    );
    const Counter = () => {
        const [count, setCount] = useState(0);
        return <button onClick={() => setCount(c => c + 1)}>Counter {count}</button>;
    };
    const WelcomePage = () => <><h1>Welcome</h1><p>Interactive counter:</p><Counter /></>;
    const TodoPage = () => {
        const [todos, setTodos] = useState<Todo[]>([]); const [text, setText] = useState('');
        useEffect(() => { fetch('/api/todos').then(res => res.json()).then(setTodos); }, []);
        const addTodo = async (e: React.FormEvent) => {
            e.preventDefault(); if (!text.trim()) return;
            const res = await fetch('/api/todos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) });
            setTodos([...todos, await res.json()]); setText('');
        };
        return <><h1>Todo List</h1><ul>{todos.map(t => <li key={t.id}>{t.text}</li>)}</ul><form onSubmit={addTodo}><input value={text} onChange={e => setText(e.target.value)} /><button>Add</button></form></>;
    };
    const StarWarsIndexPage = () => {
        const [movies, setMovies] = useState<MovieSummary[]>([]);
        useEffect(() => { fetch("https://brillout.github.io/star-wars/api/films.json").then(r => r.json()).then(setMovies); }, []);
        return <><h1>Star Wars Films</h1><ol>{movies.map(({ id, title }) => <li key={id}><a href={`/star-wars/${id}`}>{title}</a></li>)}</ol></>;
    };
    const StarWarsMoviePage = () => {
        const [movie, setMovie] = useState<MovieDetails | null>(null);
        useEffect(() => {
            const movieId = window.location.pathname.split('/').pop();
            fetch(`https://brillout.github.io/star-wars/api/films/${movieId}.json`).then(r => r.json()).then(setMovie);
        }, []);
        if (!movie) return <h1>Loading movie...</h1>;
        return <><h1>{movie.title}</h1><p>Director: {movie.director}</p><p>Producer: {movie.producer}</p><p>Released: {movie.release_date}</p></>;
    };

    return { Layout, pages: { WelcomePage, TodoPage, StarWarsIndexPage, StarWarsMoviePage } };
}

// --- SERVER-ONLY APPLICATION LOGIC ---
async function runApplication() {
    const rds = 'react-dom/server', ffy = 'fastify', esb = 'esbuild', b3 = 'better-sqlite3', fs_name = 'fs';
    const React = await import('react');
    const { renderToString } = await import(rds);
    const { default: esbuild } = await import(esb);
    const { default: DatabaseConstructor } = await import(b3);
    const { default: fastify } = await import(ffy);
    const fs = await import(fs_name);
    const { Layout, pages } = defineSharedCode(React);

    const db = new DatabaseConstructor('appo.db');
    db.exec(`CREATE TABLE IF NOT EXISTS todos (id INTEGER PRIMARY KEY, text TEXT)`);
    const allTodos = db.prepare('SELECT * FROM todos');
    const getTodo = db.prepare('SELECT * FROM todos WHERE id = ?');
    const addTodo = db.prepare('INSERT INTO todos (text) VALUES (?)');

    const server: import('fastify').FastifyInstance = fastify();

    const gracefulShutdown = async (signal: string) => {
        console.log(`\n--> Received ${signal}. Shutting down server gracefully...`);
        await server.close();
        console.log('  - Server closed.');
        process.exit(0);
    };
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

    const { outputFiles: [{ text: clientJs }] } = await esbuild.build({
        entryPoints: [process.argv[1]], bundle: true, write: false, format: 'iife',
        define: { IS_SERVER: 'false', '__build_env_dev__': String(process.env.NODE_ENV !== 'production') },
    });

    server.get('/client.js', (req, rep) => rep.header('Content-Type', 'application/javascript').send(clientJs));
    server.get('/api/todos', (req, rep) => rep.send(allTodos.all()));
    server.post<{ Body: { text: string } }>('/api/todos', (req, rep) => {
        const info = addTodo.run(req.body.text);
        rep.status(201).send(getTodo.get(Number(info.lastInsertRowid)));
    });
    server.post('/api/log', (req, rep) => {
        if (__DEV__ && req.body && typeof req.body === 'object' && 'args' in req.body && Array.isArray(req.body.args)) {
            console.log('[CLIENT]', ...req.body.args);
            try {
                if (req.body.args.some((x: unknown) => String(x) === 'FINISHO')) {
                    const pid = Number(fs.readFileSync('chrome.pid', 'utf-8'));
                    if (pid) { try { process.kill(pid, 'SIGTERM'); } catch (_) {} }
                }
            } catch (_) {}
        }
        rep.status(204).send();
    });

    const sendHtml = (rep: import('fastify').FastifyReply, appHtml: string) => {
        const html = `<!DOCTYPE html><html><head><title>appo</title></head><body><div id="root">${appHtml}</div>
        <script src="/client.js"></script></body></html>`;
        rep.header('Content-Type', 'text/html').send(html);
    };

    server.get('/', (req, rep) => sendHtml(rep, renderToString(<Layout currentUrl={req.url.split('?')[0]}><pages.WelcomePage /></Layout>)));
    server.get('/todo', (req, rep) => sendHtml(rep, renderToString(<Layout currentUrl={req.url.split('?')[0]}><pages.TodoPage /></Layout>)));
    server.get('/star-wars', (req, rep) => sendHtml(rep, renderToString(<Layout currentUrl={req.url.split('?')[0]}><pages.StarWarsIndexPage /></Layout>)));
    server.get<{ Params: { id: string } }>('/star-wars/:id', (req, rep) => sendHtml(rep, renderToString(<Layout currentUrl={req.url.split('?')[0]}><pages.StarWarsMoviePage /></Layout>)));

    await server.listen({ port: 3000 });
    fs.writeFileSync('server.pid', String(process.pid));
    console.log('--> Server running at http://localhost:3000');
    return server;
}


// --- ENVIRONMENT-SPECIFIC ENTRYPOINTS ---
if (IS_SERVER) {
    // --- SERVER-SIDE BOOTSTRAPPER ---
    const main = async () => {
        const cp_name = 'child_process', fs_name = 'fs', path_name = 'path';
        const { spawn } = await import(cp_name);
        const fs = await import(fs_name);
        const path = await import(path_name);
        const self = path.basename(process.argv[1]);

        let childProcess: import('child_process').ChildProcess | null = null;
        const cleanupAndExit = (signal: string) => {
            console.log(`\n--> Bootstrap received ${signal}. Cleaning up...`);
            const cp = childProcess;
            if (cp && cp.pid) {
                try { process.kill(-cp.pid, 'SIGTERM'); } catch (e) {}
            }
            process.exit(1);
        };
        process.on('SIGINT', () => cleanupAndExit('SIGINT'));
        process.on('SIGTERM', () => cleanupAndExit('SIGTERM'));

        const run = (cmd: string, args: string[]): Promise<number | null> => new Promise((resolve) => {
            const cp = spawn(cmd, args, { stdio: 'inherit', detached: true });
            childProcess = cp;
            cp.on('close', (code: number | null) => { childProcess = null; resolve(code); });
        });

        const clean = () => {
            console.log('--> CLEAN');
            if (fs.existsSync('server.pid')) {
                try {
                    const pid = parseInt(fs.readFileSync('server.pid', 'utf-8'), 10);
                    console.log(`  - Killing old server process (PID: ${pid})...`);
                    try { process.kill(pid, 'SIGTERM'); } catch (e: any) { if (e.code !== 'ESRCH') throw e; }
                } catch (e) { console.warn(`  - Could not kill old server process:`, e); }
            }
            // note! not deleting db!
            ['node_modules', '.pnpm-store', 'package.json', 'pnpm-lock.yaml', 'server.pid'].forEach(item => {
                if (fs.existsSync(item)) fs.rmSync(item, { recursive: true, force: true });
            });
        };
        const install = async () => {
            console.log('--> INSTALL');
            fs.writeFileSync('package.json', JSON.stringify({ name: "appo-runner", type: "module", pnpm: { onlyBuiltDependencies: ["better-sqlite3"] } }, null, 2));
            const deps = "react@18.2.0 react-dom@18.2.0 fastify@4.25.2 esbuild@0.20.2 better-sqlite3@9.4.3 @types/node@20 @types/react @types/react-dom @types/better-sqlite3 typescript@5.3.3 tsx@4.7.0";
            if (await run('pnpm', ['add', ...deps.split(' ')]) !== 0) throw new Error(`pnpm add failed`);
        };
        const tsc = async () => {
            console.log('--> TYPE-CHECK');
            const args = ['--noEmit', '--strict', '--jsx', 'react-jsx', '--module', 'NodeNext', '--moduleResolution', 'NodeNext', '--lib', 'DOM,ESNext', '--esModuleInterop', self];
            if (await run('pnpm', ['exec', 'tsc', ...args]) !== 0) throw new Error(`tsc failed`);
            console.log('  - Type-check passed.');
        };
        const serve = () => runApplication();
        const browserrun = async () => {
            console.log("--> BROWSER RUN");
            const chromePath = '/home/ubuntu/Downloads/chrome-linux64/chrome';
            if (!fs.existsSync(chromePath)) { console.warn("  - Chrome not found, skipping browser test."); return; }

            // start server in-process
            const server = await runApplication();

            // run browser self-test
            const chromeArgs = ['--headless', '--disable-gpu', '--no-sandbox', '--remote-debugging-port=9222', 'http://localhost:3000/?selftest=1'];
            console.log(`  - Running: ${chromePath} ${chromeArgs.join(' ')}`);
            const chromeProc = spawn(chromePath, chromeArgs, { stdio: 'ignore' });
            if (chromeProc.pid) fs.writeFileSync('chrome.pid', String(chromeProc.pid));
            await new Promise<void>(resolve => chromeProc.on('exit', () => resolve()));

            await server.close();
        };
        const help = () => console.log(`Usage: ./${self} [help|clean|install|tsc|serve|browserrun|full]`);

        const cmd = process.argv[2];

        try {
            if (!cmd) { clean(); await install(); await tsc(); await serve(); }
            else if (cmd === 'help') { help(); }
            else if (cmd === 'clean') { clean(); }
            else if (cmd === 'install') { await install(); }
            else if (cmd === 'tsc') { await tsc(); }
            else if (cmd === 'serve') { await serve(); }
            else if (cmd === 'browserrun') { await browserrun(); }
            else if (cmd === 'full') {
                clean(); await install(); await tsc();
                await browserrun();
                console.log("--> Full run complete.");
            }
            else { console.error(`Unknown command: ${cmd}`); help(); process.exit(1); }
        } catch (error) {
            console.error(`\n!!! COMMAND '${cmd || 'default'}' FAILED !!!\n`, error);
            process.exit(1);
        }
    };
    main();

} else {
    // --- CLIENT-SIDE ENTRYPOINT ---
    const runClient = async () => {
        const React = await import('react');
        const { hydrateRoot } = await import('react-dom/client');
        const { Layout, pages } = defineSharedCode(React);

        if (__DEV__) {
            const originalConsoleLog = console.log;
            const originalConsoleError = console.error;
            const logToServer = (level: 'log' | 'error', args: any[]) => {
                fetch('/api/log', {
                    method: 'POST', body: JSON.stringify({ level, args: args.map(arg => String(arg)) }),
                    headers: { 'Content-Type': 'application/json' },
                    keepalive: true,
                }).catch(() => { });
            };
            console.log = (...args: any[]) => { originalConsoleLog.apply(console, args); logToServer('log', args); };
            console.error = (...args: any[]) => { originalConsoleError.apply(console, args); logToServer('error', args); };
        }

        const runTestIfRequested = () => {
             const isTestRun = sessionStorage.getItem('APPO_TEST_STEP') || new URLSearchParams(window.location.search).get('selftest') === '1';
             if (!isTestRun) return;

            const runTest = async () => {
                const sleep = (ms: number) => new Promise(res => setTimeout(res, ms));
                const assert = (cond: boolean, msg: string) => { if(!cond) { console.error(`[TEST FAIL] ${msg}`); throw new Error(msg); } };
                const qs = (sel: string) => document.querySelector(sel);
                const assertText = (sel: string, text: string) => { const el = qs(sel); assert(!!el, `Element not found: ${sel}`); assert(el!.textContent === text, `Expected text '${text}' in ${sel}, got '${el!.textContent}'`); };
                const click = (sel: string) => { const el = qs(sel) as HTMLElement; assert(!!el, `Click target not found: ${sel}`); el.click(); };
                const type = (sel: string, text: string) => {
                    const el = qs(sel) as HTMLInputElement; assert(!!el, `Input not found: ${sel}`);
                    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
                    setter?.call(el, text);
                    el.dispatchEvent(new Event('input', { bubbles: true }));
                };
                const step = sessionStorage.getItem('APPO_TEST_STEP') || '0';
                console.log(`[TEST] Running step ${step} on ${window.location.pathname}`);
                await sleep(500);

                if (window.location.pathname === '/') {
                    assertText('h1', 'Welcome');
                    assert(!!qs('button'), 'Counter button missing');
                    click('button');
                    await sleep(100);
                    assertText('button', 'Counter 1');
                    console.log('[TEST] Welcome page asserts OK.');
                    sessionStorage.setItem('APPO_TEST_STEP', '1'); click('a[href="/todo"]');
                } else if (window.location.pathname === '/todo') {
                    assertText('h1', 'Todo List');
                    assert(!!qs('form'), 'Todo form missing');
                    console.log('[TEST] Todo page asserts OK.');
                    await sleep(500);
                    const randomText = 'Test a todo item ' + Math.random();
                    type('form input', randomText); click('form button');
                    await sleep(500);
                    assert(!!qs('ul li'), 'Todo item was not added to list');
                    console.log('[TEST] Added a todo OK.');
                    sessionStorage.setItem('APPO_TEST_STEP', '2'); click('a[href="/star-wars"]');
                } else if (window.location.pathname === '/star-wars') {
                    assertText('h1', 'Star Wars Films');
                    console.log('[TEST] Star Wars index asserts OK.');
                    await sleep(1000);
                    assert(!!qs('ol li'), 'Movie list empty');
                    console.log('[TEST] Movie list loaded OK.');
                    sessionStorage.setItem('APPO_TEST_STEP', '3'); click('ol li:first-child a');
                } else if (window.location.pathname.startsWith('/star-wars/')) {
                    await sleep(1000);
                    assert(!!qs('h1'), 'Movie title missing');
                    assert(document.body.textContent!.includes('Director:'), 'Director missing');
                    console.log('[TEST] Star Wars movie page asserts OK.');
                    console.log('[TEST] Self-test complete.');
                    console.log('FINISHO');
                    sessionStorage.removeItem('APPO_TEST_STEP');
                }
            };
            setTimeout(runTest, 50);
        };
        runTestIfRequested();

        let pageElement: React.ReactElement | null = null;
        const { pathname } = window.location;
        if (pathname === '/') pageElement = <pages.WelcomePage />;
        else if (pathname === '/todo') pageElement = <pages.TodoPage />;
        else if (pathname === '/star-wars') pageElement = <pages.StarWarsIndexPage />;
        else if (pathname.startsWith('/star-wars/')) pageElement = <pages.StarWarsMoviePage />;

        const root = document.getElementById('root');
        if (root && pageElement) {
            hydrateRoot(root, <Layout currentUrl={pathname}>{pageElement}</Layout>);
        }
    };
    runClient();
}
