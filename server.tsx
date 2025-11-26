#!/usr/bin/env -S pnpm dlx tsx
// This is a multi-stage, self-bootstrapping, self-type-checking, single-file full-stack app.

export { }; // Treat as a module for TypeScript correctness.

// This constant is the key to tree-shaking the server code out of the client bundle.
const IS_SERVER = typeof window === 'undefined';

// --- SHARED TYPES & GLOBALS (visible to server, client, and tsc) ---
interface Todo { id: number; text: string; }
interface MovieSummary { id: string; title: string; release_date: string; }
interface MovieDetails { title: string; director: string; producer: string; release_date: string; }

type AppData =
    | { pageName: 'WelcomePage', props: {} }
    | { pageName: 'TodoPage', props: { initialTodos: Todo[] } }
    | { pageName: 'StarWarsIndexPage', props: { movies: MovieSummary[] } }
    | { pageName: 'StarWarsMoviePage', props: { movie: MovieDetails } };

// This MUST be at the top level.
declare global { interface Window { __APP_DATA__: AppData; } }

// --- SHARED CODE FACTORY (visible to server & client) ---
function defineSharedCode(React: typeof import('react')) {
    const { useState } = React;
    type PropsWithChildren<P> = React.PropsWithChildren<P>;
    const Link = ({ href, children, currentUrl }: PropsWithChildren<{ href: string; currentUrl: string }>) => {
        const style = href === currentUrl ? { backgroundColor: '#eee' } : {};
        return <a href={href} style={{ padding: '2px 10px', textDecoration: 'none', ...style }}>{children}</a>;
    };
    const Layout = ({ children, currentUrl }: PropsWithChildren<{ currentUrl: string }>) => (
        <div style={{ display: 'flex', maxWidth: '960px', margin: 'auto' }}>
            <div style={{ padding: '20px', borderRight: '1px solid #eee' }}>
                <h2>appo-singlefile</h2>
                <Link href="/" currentUrl={currentUrl}>Welcome</Link>
                <Link href="/todo" currentUrl={currentUrl}>Todo</Link>
                <Link href="/star-wars" currentUrl={currentUrl}>Star Wars</Link>
            </div>
            <div style={{ padding: '20px' }}>{children}</div>
        </div>
    );
    const Counter = () => {
        const [count, setCount] = useState(0);
        return <button onClick={() => setCount(c => c + 1)}>Counter {count}</button>;
    };
    const WelcomePage = () => <><h1>Welcome</h1><p>Interactive counter:</p><Counter /></>;
    const TodoPage = ({ initialTodos }: { initialTodos: Todo[] }) => {
        const [todos, setTodos] = useState(initialTodos); const [text, setText] = useState('');
        const addTodo = async (e: React.FormEvent) => {
            e.preventDefault(); if (!text.trim()) return;
            const res = await fetch('/api/todos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) });
            setTodos([...todos, await res.json()]); setText('');
        };
        return <><h1>Todo List</h1><ul>{todos.map(t => <li key={t.id}>{t.text}</li>)}</ul><form onSubmit={addTodo}><input value={text} onChange={e => setText(e.target.value)} /><button>Add</button></form></>;
    };
    const StarWarsIndexPage = ({ movies }: { movies: MovieSummary[] }) => <><h1>Star Wars</h1><ol>{movies.map(({ id, title }) => <li key={id}><a href={`/star-wars/${id}`}>{title}</a></li>)}</ol></>;
    const StarWarsMoviePage = ({ movie }: { movie: MovieDetails }) => <><h1>{movie.title}</h1><p>Director: {movie.director}</p></>;

    return { Layout, pages: { WelcomePage, TodoPage, StarWarsIndexPage, StarWarsMoviePage } };
}

// --- SERVER-ONLY APPLICATION LOGIC ---
// This function is defined at the top level, but it is only ever called from within the
// `if (IS_SERVER)` block, so it will be tree-shaken from the client bundle.
async function runApplication() {
    const rds = 'react-dom/server', ffy = 'fastify', esb = 'esbuild', b3 = 'better-sqlite3';
    const React = await import('react');
    const { renderToString } = await import(rds);
    const { default: esbuild } = await import(esb);
    const { default: DatabaseConstructor } = await import(b3);
    type Fastify = typeof import('fastify').default;
    type FastifyInstance = import('fastify').FastifyInstance;
    const fastify = (await import(ffy)).default as Fastify;
    const { Layout, pages } = defineSharedCode(React);

    const db = new DatabaseConstructor('appo.db');
    db.exec(`CREATE TABLE IF NOT EXISTS todos (id INTEGER PRIMARY KEY, text TEXT)`);
    const allTodos = db.prepare('SELECT * FROM todos');
    const getTodo = db.prepare('SELECT * FROM todos WHERE id = ?');
    const addTodo = db.prepare('INSERT INTO todos (text) VALUES (?)');

    const server: FastifyInstance = fastify();
    const { outputFiles: [{ text: clientJs }] } = await esbuild.build({
        entryPoints: [process.argv[1]], bundle: true, write: false, format: 'iife',
        define: { IS_SERVER: 'false' },
    });

    server.get('/client.js', (req, rep) => rep.header('Content-Type', 'application/javascript').send(clientJs));
    server.get('/api/todos', (req, rep) => rep.send(allTodos.all()));
    server.post<{ Body: { text: string } }>('/api/todos', (req, rep) => {
        const info = addTodo.run(req.body.text);
        rep.status(201).send(getTodo.get(Number(info.lastInsertRowid)));
    });

    const sendHtml = (rep: import('fastify').FastifyReply, appData: AppData, appHtml: string) => {
        const html = `<!DOCTYPE html><html><head><title>appo</title></head><body><div id="root">${appHtml}</div>
        <script>window.__APP_DATA__=${JSON.stringify(appData)}</script><script src="/client.js"></script></body></html>`;
        rep.header('Content-Type', 'text/html').send(html);
    };

    server.get('/', (req, rep) => {
        const appData: AppData = { pageName: 'WelcomePage', props: {} };
        const appHtml = renderToString(<Layout currentUrl={req.url}><pages.WelcomePage {...appData.props} /></Layout>);
        sendHtml(rep, appData, appHtml);
    });
    server.get('/todo', (req, rep) => {
        const appData: AppData = { pageName: 'TodoPage', props: { initialTodos: allTodos.all() as Todo[] } };
        const appHtml = renderToString(<Layout currentUrl={req.url}><pages.TodoPage {...appData.props} /></Layout>);
        sendHtml(rep, appData, appHtml);
    });
    server.get('/star-wars', async (req, rep) => {
        const res = await fetch("https://brillout.github.io/star-wars/api/films.json");
        const movies = await res.json() as MovieSummary[];
        const appData: AppData = { pageName: 'StarWarsIndexPage', props: { movies } };
        const appHtml = renderToString(<Layout currentUrl={req.url}><pages.StarWarsIndexPage {...appData.props} /></Layout>);
        sendHtml(rep, appData, appHtml);
    });
    server.get<{ Params: { id: string } }>('/star-wars/:id', async (req, rep) => {
        const res = await fetch(`https://brillout.github.io/star-wars/api/films/${req.params.id}.json`);
        const movie = await res.json() as MovieDetails;
        const appData: AppData = { pageName: 'StarWarsMoviePage', props: { movie } };
        const appHtml = renderToString(<Layout currentUrl={req.url}><pages.StarWarsMoviePage {...appData.props} /></Layout>);
        sendHtml(rep, appData, appHtml);
    });

    await server.listen({ port: 3000 });
    console.log('--> Server running at http://localhost:3000');
}


// --- ENVIRONMENT-SPECIFIC ENTRYPOINTS ---
if (IS_SERVER) {
    // --- SERVER-SIDE BOOTSTRAPPER ---
    const bootstrap = async () => {
        const cp_name = 'child_process', fs_name = 'fs', path_name = 'path';
        const { spawn } = await import(cp_name);
        const fs = await import(fs_name);
        const path = await import(path_name);
        const state = process.env.APPO_STATE;
        const become = (nextState: string) => {
            console.log(`  - Becoming STAGE ${nextState}...`);
            const child = spawn('pnpm', ['dlx', 'tsx', path.basename(process.argv[1])], {
                env: { ...process.env, APPO_STATE: nextState },
                stdio: 'inherit', detached: true
            });
            child.unref();
            process.exit();
        };

        try {
            if (!state) {
                console.log('--> STAGE 0: CLEANUP');
                ['node_modules', 'package.json', 'pnpm-lock.yaml', 'appo.db'].forEach(item => {
                    if (fs.existsSync(item)) fs.rmSync(item, { recursive: true, force: true });
                });
                become('1');
            } else if (state === '1') {
                console.log('--> STAGE 1: INSTALL');
                fs.writeFileSync('package.json', JSON.stringify({ name: "appo-runner", type: "module", pnpm: { onlyBuiltDependencies: ["better-sqlite3"] }}, null, 2));
                const deps = "react@18.2.0 react-dom@18.2.0 fastify@4.25.2 esbuild@0.20.2 better-sqlite3@9.4.3 @types/node @types/react @types/react-dom @types/better-sqlite3 typescript@5.3.3 tsx@4.7.0";
                const pnpm = spawn('pnpm', ['add', ...deps.split(' ')], { stdio: 'inherit' });
                pnpm.on('close', (code: number | null) => {
                    if (code !== 0) throw new Error(`pnpm add failed with code ${code}`);
                    become('2');
                });
            } else if (state === '2') {
                console.log('--> STAGE 2: TYPE-CHECK');
                const tsc_args = ['--noEmit', '--strict', '--jsx', 'react-jsx', '--module', 'NodeNext', '--moduleResolution', 'NodeNext', '--lib', 'DOM,ESNext', '--esModuleInterop', path.basename(process.argv[1])].join(' ');
                const tsc = spawn('pnpm', ['exec', 'tsc', ...tsc_args.split(' ')], { stdio: 'inherit' });
                tsc.on('close', (code: number | null) => {
                    if (code !== 0) throw new Error(`tsc failed with code ${code}`);
                    console.log('  - Type-check passed.');
                    become('3');
                });
            } else if (state === '3') {
                console.log('--> STAGE 3: RUN');
                await runApplication();
            }
        } catch (error) {
            console.error(`\n!!! STAGE '${state || '0'}' FAILED !!!\n`, error);
            process.exit(1);
        }
    };
    bootstrap();

} else {
    // --- CLIENT-SIDE ENTRYPOINT ---
    const runClient = async () => {
        const React = await import('react');
        const { hydrateRoot } = await import('react-dom/client');
        const { Layout, pages } = defineSharedCode(React);
        const root = document.getElementById('root');
        const { pageName, props } = window.__APP_DATA__;
        if (root) {
            let pageElement: React.ReactElement | null = null;
            switch (pageName) {
                case 'WelcomePage': pageElement = <pages.WelcomePage {...props} />; break;
                case 'TodoPage': pageElement = <pages.TodoPage {...props} />; break;
                case 'StarWarsIndexPage': pageElement = <pages.StarWarsIndexPage {...props} />; break;
                case 'StarWarsMoviePage': pageElement = <pages.StarWarsMoviePage {...props} />; break;
            }
            if (pageElement) hydrateRoot(root, <Layout currentUrl={window.location.pathname}>{pageElement}</Layout>);
        }
    };
    runClient();
}
