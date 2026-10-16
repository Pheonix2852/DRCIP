import { Link } from 'react-router-dom';
import { Button } from './ui/button';
import { Card, CardHeader, CardContent } from './ui/card';
import { useDocumentTitle } from '../lib/document-title';

export function NotFoundPage() {
  useDocumentTitle('Page not found · DRCIP');
  return (
    <div className="flex h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md text-center">
        <CardHeader>
          <h1 className="text-4xl font-bold">404</h1>
          <p className="text-muted-foreground">Page not found</p>
        </CardHeader>
        <CardContent>
          <Button asChild>
            <Link to="/">Return home</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
