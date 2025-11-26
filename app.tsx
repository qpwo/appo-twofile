import fastify from 'fastify';
import React, { useState, useEffect } from 'react';
import { renderToString } from 'react-dom/server';
import esbuild from 'esbuild';
import fetch from 'node-fetch';

// --- SECTION 1: SHARED REACT COMPONENTS ---
// These components run on both the server (for SSR) and the client (for hydration).

function Link({ href, children, currentUrl }) {
  const isActive = href === currentUrl;
  const style = isActive ? { backgroundColor: '#eee' } : {};
  return <a href={href} style={{ padding: '2px 10px', textDecoration: 'none', display: 'block', ...style }}>{children}</a>;
}

function Layout({ children, currentUrl }) {
  return (
    <div style={{ display: 'flex', maxWidth: '960px', margin: 'auto', fontFamily: 'sans-serif' }}>
      <div style={{ padding: '20px', borderRight: '1px solid #eee', flexShrink: 0 }}>
        <h2>appo-singlefile</h2>
        <Link href="/" currentUrl={currentUrl}>Welcome</Link>
        <Link href="/todo" currentUrl={currentUrl}>Todo</Link>
        <Link href="/star-wars" currentUrl={currentUrl}>Star Wars</Link>
      </div>
      <div style={{ padding: '20px', width: '100%' }}>
        {children}
      </div>
    </div>
  );
}

function Counter() {
  const [count, setCount] = useState(0);
  return <button type="button" onClick={() => setCount((c) => c + 1)}>Counter {count}</button>;
}

function WelcomePage() {
  return (
    <>
      <h1>Welcome</h1>
      <p>This is an interactive counter:</p>
      <Counter />
    </>
  );
}

function TodoPage({ initialTodos }) {
  const [todos, setTodos] = useState(initialTodos);
  const [newTodo, setNewTodo] = useState('');

  const addTodo = async (e) => {
    e.preventDefault();
    if (!newTodo) return;
    const response = await window.fetch('/api/todos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: newTodo }),
    });
    const createdTodo = await response.json();
    setTodos([...todos, createdTodo]);
    setNewTodo('');
  };

  return (
    <>
      <h1>Todo List</h1>
      <ul>{todos.map(todo => <li key={todo.id}>{todo.text}</li>)}</ul>
      <form onSubmit={addTodo}>
        <input type="text" value={newTodo} onChange={e => setNewTodo(e.target.value)} />
        <button type="submit">Add</button>
      </form>
    </>
  );
}

function StarWarsIndexPage({ movies }) {
  return (
    <>
      <h1>Star Wars Movies</h1>
      <ol>
        {movies.map(({ id, title, release_date }) => (
          <li key={id}>
            <a href={`/star-wars/${id}`}>{title}</a> ({release_date})
          </li>
        ))}
      </ol>
    </>
  );
}

function StarWarsMoviePage({ movie }) {
  return (
    <>
      <h1>{movie.title}</h1>
      <p>Director: {movie.director}</p>
      <p>Producer: {movie.producer}</p>
      <p>Release Date: {movie.release_date}</p>
    </>
  );
}

// --- SECTION 2: CLIENT-SIDE HYDRATION SCRIPT ---
// This string contains all the code that will run in the browser.
// We use `Function.toString()` to serialize our components into this script.

const clientEntryCode = `
import React, { useState, useEffect } from 'react';
import { hydrateRoot } from 'react-dom/client';

// All components need to be included here for the client bundle.
${Link.toString()}
${Layout.toString()}
${Counter.toString()}
${WelcomePage.toString()}
${TodoPage.toString()}
${StarWarsIndexPage.toString()}
${StarWarsMoviePage.toString()}

const Pagemap = {
  WelcomePage,
  TodoPage,
  StarWarsIndexPage,
  StarWarsMoviePage,
};

const Page = Pagemap[window.__PAGE_NAME__];
const props = window.__INITIAL_PROPS__;
const currentUrl = window.location.pathname;

// Hydrate the app on the client
hydrateRoot(
  document.getElementById('root'),
  <Layout currentUrl={currentUrl}><Page {...props} /></Layout>
);
`;

// --- SECTION 3: SERVER LOGIC ---

// In-memory "database" for Todos
const todosDB = [{ id: 1, text: "Learn SSR" }, { id: 2, text: "Profit" }];
let nextTodoId = 3;

async function startServer() {
  const server = fastify();

  // On-the-fly esbuild compilation of the client-side code
  const clientJs = (await esbuild.build({
    stdin: { contents: clientEntryCode, resolveDir: process.cwd(), loader: 'tsx' },
    bundle: true, write: false, format: 'iife'
  })).outputFiles[0].text;

  server.get('/client.js', (req, reply) => {
    reply.header('Content-Type', 'application/javascript').send(clientJs);
  });

  // API Routes
  server.get('/api/todos', (req, reply) => { reply.send(todosDB); });
  server.post('/api/todos', (req, reply) => {
    const newTodo = { id: nextTodoId++, text: (req.body as any).text };
    todosDB.push(newTodo);
    reply.status(201).send(newTodo);
  });

  // Page rendering helper
  const renderPage = (reply, PageComponent, props, url) => {
    const pageName = PageComponent.name;
    const appHtml = renderToString(
      <Layout currentUrl={url}>
        <PageComponent {...props} />
      </Layout>
    );

    const html = `
      <!DOCTYPE html>
      <html>
        <head><title>appo-singlefile</title></head>
        <body>
          <div id="root">${appHtml}</div>
          <script>
            window.__PAGE_NAME__ = "${pageName}";
            window.__INITIAL_PROPS__ = ${JSON.stringify(props)};
          </script>
          <script src="/client.js"></script>
        </body>
      </html>`;
    reply.header('Content-Type', 'text/html').send(html);
  };

  // Page Routes (SSR)
  server.get('/', (req, reply) => {
    renderPage(reply, WelcomePage, {}, req.url);
  });

  server.get('/todo', (req, reply) => {
    renderPage(reply, TodoPage, { initialTodos: todosDB }, req.url);
  });

  server.get('/star-wars', async (req, reply) => {
    const response = await fetch("https://brillout.github.io/star-wars/api/films.json");
    const data = await response.json();
    const movies = data.map(({ id, title, release_date }) => ({ id, title, release_date }));
    renderPage(reply, StarWarsIndexPage, { movies }, req.url);
  });

  server.get('/star-wars/:id', async (req, reply) => {
    const { id } = req.params as any;
    const response = await fetch(`https://brillout.github.io/star-wars/api/films/${id}.json`);
    const movie = await response.json();
    renderPage(reply, StarWarsMoviePage, { movie }, req.url);
  });

  await server.listen({ port: 3000 });
  console.log('Server listening on http://localhost:3000');
}

startServer().catch(err => { console.error(err); process.exit(1); });
