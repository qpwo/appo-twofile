import fastify from 'fastify';
import React, { useState } from 'react';
import { renderToString } from 'react-dom/server';
import esbuild from 'esbuild';
import fetch from 'node-fetch';

// --- SECTION 1: UNIVERSAL COMPONENTS ---
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

function TodoPage({ initialTodos }: { initialTodos: { id: number; text: string }[] }) {
  const [todos, setTodos] = useState(initialTodos);
  const [newTodo, setNewTodo] = useState('');

  const addTodo = async (e: React.FormEvent) => {
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
        <input type="text" value={newTodo} onChange={e => setNewTodo(e.target.value)} style={{marginRight: '8px'}} />
        <button type="submit">Add</button>
      </form>
    </>
  );
}

function StarWarsIndexPage({ movies }: { movies: { id: string; title: string; release_date: string }[] }) {
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

function StarWarsMoviePage({ movie }: { movie: { title: string; director: string; producer: string; release_date: string } }) {
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
const clientEntryCode = `
import React, { useState } from 'react';
import { hydrateRoot } from 'react-dom/client';

// --- UNIVERSAL COMPONENTS (duplicated for bundling) ---
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
        <input type="text" value={newTodo} onChange={e => setNewTodo(e.target.value)} style={{marginRight: '8px'}} />
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
            <a href={\`/star-wars/\${id}\`}>{title}</a> ({release_date})
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

// --- HYDRATION LOGIC ---
const Pagemap = { WelcomePage, TodoPage, StarWarsIndexPage, StarWarsMoviePage };
const PageComponent = Pagemap[window.__PAGE_NAME__];
const props = window.__INITIAL_PROPS__;
const currentUrl = window.location.pathname;

hydrateRoot(
  document.getElementById('root'),
  <Layout currentUrl={currentUrl}><PageComponent {...props} /></Layout>
);
`;

// --- SECTION 3: SERVER LOGIC ---
async function startServer() {
  const todosDB = [{ id: 1, text: "Learn SSR" }, { id: 2, text: "Profit" }];
  let nextTodoId = 3;

  const server = fastify();

  const { outputFiles: [{ text: clientJs }] } = await esbuild.build({
    stdin: { contents: clientEntryCode, resolveDir: process.cwd(), loader: 'tsx' },
    bundle: true, write: false, format: 'iife'
  });

  server.get('/client.js', (_req, reply) => {
    reply.header('Content-Type', 'application/javascript').send(clientJs);
  });

  server.get('/api/todos', (_req, reply) => reply.send(todosDB));
  server.post('/api/todos', (req, reply) => {
    const newTodo = { id: nextTodoId++, text: (req.body as { text: string }).text };
    todosDB.push(newTodo);
    reply.status(201).send(newTodo);
  });

  const renderPage = (reply: any, PageComponent: React.FC<any>, props: any, url: string) => {
    const appHtml = renderToString(
      <Layout currentUrl={url}>
        <PageComponent {...props} />
      </Layout>
    );

    const html = `<!DOCTYPE html>
<html>
  <head><title>appo-singlefile</title></head>
  <body>
    <div id="root">${appHtml}</div>
    <script>
      window.__PAGE_NAME__ = "${PageComponent.name}";
      window.__INITIAL_PROPS__ = ${JSON.stringify(props)};
    </script>
    <script src="/client.js"></script>
  </body>
</html>`;
    reply.header('Content-Type', 'text/html').send(html);
  };

  server.get('/', (req, reply) => {
    renderPage(reply, WelcomePage, {}, req.url);
  });

  server.get('/todo', (req, reply) => {
    renderPage(reply, TodoPage, { initialTodos: todosDB }, req.url);
  });

  server.get('/star-wars', async (req, reply) => {
    const res = await fetch("https://brillout.github.io/star-wars/api/films.json");
    const data = await res.json() as any[];
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
  console.log('Server running at http://localhost:3000');
}

startServer().catch(err => {
  console.error(err);
  process.exit(1);
});
