#!/usr/bin/env -S pnpm dlx tsx

// This is a multi-stage, self-bootstrapping, self-type-checking, single-file full-stack app.
export { };

const IS_SERVER = typeof window === 'undefined';

declare const __build_env_dev__: boolean;

const __DEV__ = IS_SERVER ? process.env.NODE_ENV !== 'production' : __build_env_dev__;


// --- SHARED TYPES ---

interface Todo {
  id: number;
  text: string;
}

interface MovieSummary {
  id: string;
  title: string;
  release_date: string;
}

interface MovieDetails {
  title: string;
  director: string;
  producer: string;
  release_date: string;
}


// --- SHARED CODE FACTORY ---

function defineSharedCode(React: typeof import('react')) {
  const { useState, useEffect } = React;

  type PropsWithChildren<P> = import('react').PropsWithChildren<P>;
  type FormEvent = import('react').FormEvent;
  type ChangeEvent<T> = import('react').ChangeEvent<T>;

  function Link({ href, children, currentUrl }: PropsWithChildren<{ href: string; currentUrl: string }>) {
    const isCurrent = href === currentUrl;
    const style = isCurrent ? { backgroundColor: '#eee' } : {};
    const finalStyle = { padding: '2px 10px', textDecoration: 'none', ...style };

    const idSafeIdx = href.replace(/[^a-z0-9]/g, '_');
    return <a id={`nav_link_${idSafeIdx}`} href={href} style={finalStyle}>{children}</a>;
  }


  function Layout({ children, currentUrl }: PropsWithChildren<{ currentUrl: string }>) {
    return <div id="layout_root" style={{ display: 'flex', maxWidth: '960px', margin: 'auto' }}>
        <nav id="main_nav" style={{ padding: '20px', borderRight: '1px solid #eee' }}>
          <h2>appo-singlefile</h2>
          <Link href="/" currentUrl={currentUrl}>Welcome</Link>
          <Link href="/todo" currentUrl={currentUrl}>Todo</Link>
          <Link href="/star-wars" currentUrl={currentUrl}>Star Wars</Link>
        </nav>
        <main id="main_content" style={{ padding: '20px' }}>{children}</main>
      </div>;
  }


  function Counter() {
    const [count, setCount] = useState(0);

    function increment() {
      setCount(c => c + 1);
    }

    return <button id="counter_btn" onClick={increment}>Counter {count}</button>;
  }


  function WelcomePage() {
    return <div id="page_welcome">
        <h1>Welcome</h1>
        <p>Interactive counter:</p>
        <Counter />
      </div>;
  }


  function TodoPage() {
    const [todos, setTodos] = useState<Todo[]>([]);
    const [text, setText] = useState('');

    useEffect(function mount() {
      fetch('/api/todos').then(res => res.json()).then(setTodos);
    }, []);

    async function addTodo(e: FormEvent) {
      e.preventDefault();
      if (!text.trim()) return;
      const opts = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) };
      const res = await fetch('/api/todos', opts);
      const newTodo = await res.json();
      setTodos(prev => [...prev, newTodo]);
      setText('');
    }

    function handleChange(e: ChangeEvent<HTMLInputElement>) {
      setText(e.target.value);
    }

    return <div id="page_todo">
        <h1>Todo List</h1>
        <ul id="todo_list">
          {todos.map(t => <li key={t.id} id={`todo_${t.id}`}>{t.text}</li>)}
        </ul>
        <form id="todo_form" onSubmit={addTodo}>
          <input id="todo_input" value={text} onChange={handleChange} />
          <button id="todo_add_btn">Add</button>
        </form>
      </div>;
  }


  function StarWarsIndexPage() {
    const [movies, setMovies] = useState<MovieSummary[]>([]);

    useEffect(function mount() {
      fetch("https://brillout.github.io/star-wars/api/films.json").then(r => r.json()).then(setMovies);
    }, []);

    return <div id="page_starwars_index">
        <h1>Star Wars Films</h1>
        <ol id="movie_list">
          {movies.map(m => <li key={m.id} id={`movie_${m.id}`}>
              <a id={`movie_link_${m.id}`} href={`/star-wars/${m.id}`}>{m.title}</a>
            </li>)}
        </ol>
      </div>;
  }


  function StarWarsMoviePage() {
    const [movie, setMovie] = useState<MovieDetails | null>(null);

    useEffect(function mount() {
      const movieId = window.location.pathname.split('/').pop();
      fetch(`https://brillout.github.io/star-wars/api/films/${movieId}.json`).then(r => r.json()).then(setMovie);
    }, []);

    if (!movie) return <h1 id="loading_msg">Loading movie...</h1>;

    return <div id="page_starwars_movie">
        <h1 id="movie_title">{movie.title}</h1>
        <p id="movie_director">Director: {movie.director}</p>
        <p id="movie_producer">Producer: {movie.producer}</p>
        <p id="movie_release">Released: {movie.release_date}</p>
      </div>;
  }


  return { Layout, pages: { WelcomePage, TodoPage, StarWarsIndexPage, StarWarsMoviePage } };
}


// --- SERVER-ONLY APPLICATION LOGIC ---

async function runApplication() {
  const s_module = 'module';
  const mod = await import(s_module) as { createRequire: (url: string) => NodeRequire };
  const require = mod.createRequire(import.meta.url);

  const s_react = 'react';
  const s_rds = 'react-dom/server';
  const s_ffy = 'fastify';
  const s_esb = 'esbuild';
  const s_b3 = 'better-sqlite3';
  const s_fs = 'fs';

  const React = await import(s_react);
  const { renderToString }: typeof import('react-dom/server') = require(s_rds);
  const esbuild: typeof import('esbuild') = require(s_esb);
  const DatabaseConstructor: typeof import('better-sqlite3') = require(s_b3);
  const fastify: typeof import('fastify') = require(s_ffy);
  const fs: typeof import('fs') = require(s_fs);

  const { Layout, pages } = defineSharedCode(React);

  const db = new DatabaseConstructor('appo.db');
  db.exec(`CREATE TABLE IF NOT EXISTS todos (id INTEGER PRIMARY KEY, text TEXT)`);

  const stmtAllTodos = db.prepare('SELECT * FROM todos');
  const stmtGetTodo = db.prepare('SELECT * FROM todos WHERE id = ?');
  const stmtAddTodo = db.prepare('INSERT INTO todos (text) VALUES (?)');

  const server = fastify();


  async function gracefulShutdown(signal: string) {
    console.log(`\n--> Received ${signal}. Shutting down server gracefully...`);
    await server.close();
    console.log('  - Server closed.');
    process.exit(0);
  }

  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));


  const clientBuild = await esbuild.build({
    entryPoints: [process.argv[1]],
    bundle: true,
    write: false,
    format: 'iife',
    define: { IS_SERVER: 'false', '__build_env_dev__': String(process.env.NODE_ENV !== 'production') },
  });
  const clientJs = clientBuild.outputFiles[0].text;


  function handleClientJs(req: unknown, rep: import('fastify').FastifyReply) {
    rep.header('Content-Type', 'application/javascript').send(clientJs);
  }
  server.get('/client.js', handleClientJs);


  function handleGetTodos(req: unknown, rep: import('fastify').FastifyReply) {
    rep.send(stmtAllTodos.all());
  }
  server.get('/api/todos', handleGetTodos);


  function handleAddTodo(req: import('fastify').FastifyRequest<{ Body: { text: string } }>, rep: import('fastify').FastifyReply) {
    const info = stmtAddTodo.run(req.body.text);
    const newTodo = stmtGetTodo.get(Number(info.lastInsertRowid));
    rep.status(201).send(newTodo);
  }
  server.post<{ Body: { text: string } }>('/api/todos', handleAddTodo);


  function handleClientLog(req: import('fastify').FastifyRequest, rep: import('fastify').FastifyReply) {
    if (!__DEV__) return rep.status(204).send();

    const body = req.body as any;
    if (body && typeof body === 'object' && Array.isArray(body.args)) {
      console.log('[CLIENT]', ...body.args);
      checkFinisho(body.args);
    }
    rep.status(204).send();
  }
  server.post('/api/log', handleClientLog);


  function checkFinisho(args: unknown[]) {
    const isFinisho = args.some(x => String(x) === 'FINISHO');
    if (isFinisho) {
      killChrome();
    }
  }


  function killChrome() {
    try {
      const pidStr = fs.readFileSync('chrome.pid', 'utf-8');
      const pid = Number(pidStr);
      if (pid) process.kill(pid, 'SIGTERM');
    } catch (_) {
      // ignore
    }
  }


  function sendHtml(rep: import('fastify').FastifyReply, appHtml: string) {
    const html = `<!DOCTYPE html>
<html>
  <head><title>appo</title></head>
  <body>
    <div id="root">${appHtml}</div>
    <script src="/client.js"></script>
  </body>
</html>`;
    rep.header('Content-Type', 'text/html').send(html);
  }


  function handleRoot(req: import('fastify').FastifyRequest, rep: import('fastify').FastifyReply) {
    const currentUrl = req.url.split('?')[0];
    const content = renderToString(<Layout currentUrl={currentUrl}><pages.WelcomePage /></Layout>);
    sendHtml(rep, content);
  }
  server.get('/', handleRoot);


  function handleTodoPage(req: import('fastify').FastifyRequest, rep: import('fastify').FastifyReply) {
    const currentUrl = req.url.split('?')[0];
    const content = renderToString(<Layout currentUrl={currentUrl}><pages.TodoPage /></Layout>);
    sendHtml(rep, content);
  }
  server.get('/todo', handleTodoPage);


  function handleStarWarsIndex(req: import('fastify').FastifyRequest, rep: import('fastify').FastifyReply) {
    const currentUrl = req.url.split('?')[0];
    const content = renderToString(<Layout currentUrl={currentUrl}><pages.StarWarsIndexPage /></Layout>);
    sendHtml(rep, content);
  }
  server.get('/star-wars', handleStarWarsIndex);


  function handleStarWarsMovie(req: import('fastify').FastifyRequest, rep: import('fastify').FastifyReply) {
    const currentUrl = req.url.split('?')[0];
    const content = renderToString(<Layout currentUrl={currentUrl}><pages.StarWarsMoviePage /></Layout>);
    sendHtml(rep, content);
  }
  server.get('/star-wars/:id', handleStarWarsMovie);


  await server.listen({ port: 3000 });
  fs.writeFileSync('server.pid', String(process.pid));
  console.log('--> Server running at http://localhost:3000');

  return server;
}


// --- ENVIRONMENT-SPECIFIC ENTRYPOINTS ---

if (IS_SERVER) {
  bootstrap();
}

async function bootstrap() {
  const s_cp = 'child_process';
  const s_fs = 'fs';
  const s_path = 'path';

  const { spawn }: typeof import('child_process') = await import(s_cp);
  const fs: typeof import('fs') = await import(s_fs);
  const path: typeof import('path') = await import(s_path);

  const selfVal = process.argv[1];
  const selfBase = path.basename(selfVal);
  let childProcess: import('child_process').ChildProcess | null = null;


  function cleanupAndExit(signal: string) {
    console.log(`\n--> Bootstrap received ${signal}. Cleaning up...`);
    if (childProcess && childProcess.pid) {
      try { process.kill(-childProcess.pid, 'SIGTERM'); } catch (e) {}
    }
    process.exit(1);
  }

  process.on('SIGINT', () => cleanupAndExit('SIGINT'));
  process.on('SIGTERM', () => cleanupAndExit('SIGTERM'));


  function run(cmd: string, args: string[]) {
    return new Promise<number | null>((resolve) => {
      const cp = spawn(cmd, args, { stdio: 'inherit', detached: true });
      childProcess = cp;
      cp.on('close', (code: number | null) => {
        childProcess = null;
        resolve(code);
      });
    });
  }


  function killPid(pid: number) {
    try {
      process.kill(pid, 'SIGTERM');
    } catch (e: any) {
      if (e.code !== 'ESRCH') throw e;
    }
  }


  function clean() {
    console.log('--> CLEAN');
    if (fs.existsSync('server.pid')) {
      try {
        const pid = parseInt(fs.readFileSync('server.pid', 'utf-8'), 10);
        console.log(`  - Killing old server process (PID: ${pid})...`);
        killPid(pid);
      } catch (e) {
        console.warn(`  - Could not kill old server process:`, e);
      }
    }

    const toRemove = ['node_modules', '.pnpm-store', 'package.json', 'pnpm-lock.yaml', 'server.pid'];
    toRemove.forEach(item => {
      if (fs.existsSync(item)) fs.rmSync(item, { recursive: true, force: true });
    });
  }


  async function install() {
    console.log('--> INSTALL');
    const pkg = { name: "appo-runner", type: "module", pnpm: { onlyBuiltDependencies: ["better-sqlite3"] } };
    fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2));

    const deps = "react@18.2.0 react-dom@18.2.0 fastify@4.25.2 esbuild@0.20.2 better-sqlite3@9.4.3 @types/node@20 @types/react @types/react-dom @types/better-sqlite3 typescript@5.3.3 tsx@4.7.0";
    const code = await run('pnpm', ['add', ...deps.split(' ')]);

    if (code !== 0) throw new Error(`pnpm add failed`);
  }


  async function tsc() {
    console.log('--> TYPE-CHECK');
    const args = ['--noEmit', '--strict', '--jsx', 'react-jsx', '--module', 'NodeNext', '--moduleResolution', 'NodeNext', '--lib', 'DOM,ESNext', '--esModuleInterop', selfBase];
    const code = await run('pnpm', ['exec', 'tsc', ...args]);

    if (code !== 0) throw new Error(`tsc failed`);
    console.log('  - Type-check passed.');
  }


  async function serve() {
    await runApplication();
  }


  async function browserrun() {
    console.log("--> BROWSER RUN");
    const chromePath = '/home/ubuntu/Downloads/chrome-linux64/chrome';
    if (!fs.existsSync(chromePath)) {
      console.warn("  - Chrome not found, skipping browser test.");
      return;
    }

    const server = await runApplication();

    const chromeArgs = ['--headless', '--disable-gpu', '--no-sandbox', '--remote-debugging-port=9222', 'http://localhost:3000/?selftest=1'];
    console.log(`  - Running: ${chromePath} ${chromeArgs.join(' ')}`);

    const chromeProc = spawn(chromePath, chromeArgs, { stdio: 'ignore' });
    if (chromeProc.pid) fs.writeFileSync('chrome.pid', String(chromeProc.pid));

    await new Promise<void>(resolve => chromeProc.on('exit', () => resolve()));
    await server.close();
  }


  function help() {
    console.log(`Usage: ./${selfBase} [help|clean|install|tsc|serve|browserrun|full]`);
  }


  async function main() {
    const cmd = process.argv[2];
    try {
      if (!cmd) {
        clean();
        await install();
        await tsc();
        await serve();
      } else if (cmd === 'help') {
        help();
      } else if (cmd === 'clean') {
        clean();
      } else if (cmd === 'install') {
        await install();
      } else if (cmd === 'tsc') {
        await tsc();
      } else if (cmd === 'serve') {
        await serve();
      } else if (cmd === 'browserrun') {
        await browserrun();
      } else if (cmd === 'full') {
        clean();
        await install();
        await tsc();
        await browserrun();
        console.log("--> Full run complete.");
      } else {
        console.error(`Unknown command: ${cmd}`);
        help();
        process.exit(1);
      }
    } catch (error) {
      console.error(`\n!!! COMMAND '${cmd || 'default'}' FAILED !!!\n`, error);
      process.exit(1);
    }
  }

  await main();
}

if (!IS_SERVER) {
  runClient();
}

async function runClient() {
  const React = await import('react');
  const { hydrateRoot } = await import('react-dom/client');
  const { Layout, pages } = defineSharedCode(React);

  if (__DEV__) {
    setupDevLogging();
  }

  function setupDevLogging() {
    const originalConsoleLog = console.log;
    const originalConsoleError = console.error;

    function logToServer(level: 'log' | 'error', args: any[]) {
      const body = JSON.stringify({ level, args: args.map(arg => String(arg)) });
      fetch('/api/log', {
        method: 'POST',
        body,
        headers: { 'Content-Type': 'application/json' },
        keepalive: true,
      }).catch(() => { });
    }

    console.log = function(...args: any[]) {
      originalConsoleLog.apply(console, args);
      logToServer('log', args);
    };

    console.error = function(...args: any[]) {
      originalConsoleError.apply(console, args);
      logToServer('error', args);
    };
  }


  const runTestIfRequested = function() {
    const searchParams = new URLSearchParams(window.location.search);
    const isTestRun = sessionStorage.getItem('APPO_TEST_STEP') || searchParams.get('selftest') === '1';
    if (!isTestRun) return;

    const sleep = (ms: number) => new Promise(res => setTimeout(res, ms));

    function assert(cond: boolean, msg: string) {
      if (!cond) {
        console.error(`[TEST FAIL] ${msg}`);
        throw new Error(msg);
      }
    }

    function qs(sel: string) {
      const el = document.querySelector(sel);
      return el;
    }

    function assertText(sel: string, text: string) {
      const el = qs(sel);
      assert(!!el, `Element not found: ${sel}`);
      const content = el!.textContent || '';
      assert(content === text, `Expected text '${text}' in ${sel}, got '${content}'`);
    }

    function click(sel: string) {
      const el = qs(sel) as HTMLElement;
      assert(!!el, `Click target not found: ${sel}`);
      el.click();
    }

    function type(sel: string, text: string) {
      const el = qs(sel) as HTMLInputElement;
      assert(!!el, `Input not found: ${sel}`);
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
      if (setter) setter.call(el, text);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }

    async function runTest() {
      const step = sessionStorage.getItem('APPO_TEST_STEP') || '0';
      const pathname = window.location.pathname;
      console.log(`[TEST] Running step ${step} on ${pathname}`);
      await sleep(500);

      if (pathname === '/') {
        assertText('h1', 'Welcome');
        assert(!!qs('#counter_btn'), 'Counter button missing');
        click('#counter_btn');
        await sleep(100);
        assertText('#counter_btn', 'Counter 1');
        console.log('[TEST] Welcome page asserts OK.');

        sessionStorage.setItem('APPO_TEST_STEP', '1');
        click('#nav_link__todo');

      } else if (pathname === '/todo') {
        assertText('h1', 'Todo List');
        assert(!!qs('#todo_form'), 'Todo form missing');
        console.log('[TEST] Todo page asserts OK.');
        await sleep(500);

        const randomText = 'Test a todo item ' + Math.random();
        type('#todo_input', randomText);
        click('#todo_add_btn');
        await sleep(500);

        assert(!!qs('#todo_list li'), 'Todo item was not added to list');
        console.log('[TEST] Added a todo OK.');

        sessionStorage.setItem('APPO_TEST_STEP', '2');
        click('#nav_link__star_wars');

      } else if (pathname === '/star-wars') {
        assertText('h1', 'Star Wars Films');
        console.log('[TEST] Star Wars index asserts OK.');
        await sleep(1000);

        assert(!!qs('#movie_list li'), 'Movie list empty');
        console.log('[TEST] Movie list loaded OK.');

        sessionStorage.setItem('APPO_TEST_STEP', '3');
        click('#movie_list li:first-child a');

      } else if (pathname.startsWith('/star-wars/')) {
        await sleep(1000);
        assert(!!qs('#movie_title'), 'Movie title missing');
        const dirText = qs('#movie_director')?.textContent || '';
        assert(dirText.includes('Director:'), 'Director missing');

        console.log('[TEST] Star Wars movie page asserts OK.');
        console.log('[TEST] Self-test complete.');
        console.log('FINISHO');
        sessionStorage.removeItem('APPO_TEST_STEP');
      }
    }

    setTimeout(runTest, 50);
  };

  runTestIfRequested();


  let pageElement: import('react').ReactElement | null = null;
  const { pathname } = window.location;

  if (pathname === '/') {
    pageElement = <pages.WelcomePage />;
  } else if (pathname === '/todo') {
    pageElement = <pages.TodoPage />;
  } else if (pathname === '/star-wars') {
    pageElement = <pages.StarWarsIndexPage />;
  } else if (pathname.startsWith('/star-wars/')) {
    pageElement = <pages.StarWarsMoviePage />;
  }

  const root = document.getElementById('root');
  if (root && pageElement) {
    const content = <Layout currentUrl={pathname}>{pageElement}</Layout>;
    hydrateRoot(root, content);
  }
}
