import fastify from 'fastify';
import React from 'react';
import { renderToString } from 'react-dom/server';
import esbuild from 'esbuild';
import fetch from 'node-fetch';

// Import UI components from app.tsx
// Note: Node's ESM requires the .js extension even for .ts/.tsx files during runtime resolution.
import { Layout, WelcomePage, TodoPage, StarWarsIndexPage, StarWarsMoviePage } from './app.js';

async function startServer() {
  const todosDB = [{ id: 1, text: "Learn SSR" }, { id: 2, text: "Profit" }];
  let nextTodoId = 3;

  const server = fastify();

  // Esbuild now uses app.tsx as its entry point instead of a string
  const { outputFiles: [{ text: clientJs }] } = await esbuild.build({
    entryPoints: ['app.tsx'],
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
