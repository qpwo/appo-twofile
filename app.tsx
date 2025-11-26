import React, { useState } from 'react';
import { hydrateRoot } from 'react-dom/client';

// --- SHARED COMPONENTS (now exported) ---

export function Link({ href, children, currentUrl }: { href: string; children: React.ReactNode; currentUrl: string }) {
  const isActive = href === currentUrl;
  const style = isActive ? { backgroundColor: '#eee' } : {};
  return <a href={href} style={{ padding: '2px 10px', textDecoration: 'none', display: 'block', ...style }}>{children}</a>;
}

export function Layout({ children, currentUrl }: { children: React.ReactNode; currentUrl: string }) {
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

export function Counter() {
    const [count, setCount] = useState(0);
    return <button type="button" onClick={() => setCount((c) => c + 1)}>Counter {count}</button>;
}

export function WelcomePage() {
  return (
    <>
      <h1>Welcome</h1>
      <p>This is an interactive counter:</p>
      <Counter />
    </>
  );
}

export function TodoPage({ initialTodos }: { initialTodos: { id: number; text: string }[] }) {
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

export function StarWarsIndexPage({ movies }: { movies: { id: string; title: string; release_date: string }[] }) {
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

export function StarWarsMoviePage({ movie }: { movie: { title: string; director: string; producer: string; release_date: string } }) {
  return (
    <>
      <h1>{movie.title}</h1>
      <p>Director: {movie.director}</p>
      <p>Producer: {movie.producer}</p>
      <p>Release Date: {movie.release_date}</p>
    </>
  );
}

// --- CLIENT-SIDE HYDRATION LOGIC ---
// This code only runs when this file is executed in a browser environment.
if (typeof window !== 'undefined') {
  const pages = { WelcomePage, TodoPage, StarWarsIndexPage, StarWarsMoviePage };
  const PageComponent = pages[(window as any).__PAGE_NAME__];
  const props = (window as any).__INITIAL_PROPS__;
  const currentUrl = window.location.pathname;

  if (PageComponent) {
    hydrateRoot(
      document.getElementById('root')!,
      <Layout currentUrl={currentUrl}><PageComponent {...props} /></Layout>
    );
  }
}
