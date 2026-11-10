import { Link, Route, Routes } from 'react-router';
import { StatusPage } from './routes/status';

export function App() {
  return (
    <Routes>
      <Route path="/" element={<StatusPage />} />
      <Route
        path="*"
        element={
          <main>
            <h1>Page not found</h1>
            <p>This address does not exist.</p>
            <Link to="/">Return to status page</Link>
          </main>
        }
      />
    </Routes>
  );
}
