import { createApp } from './app';
import { WebSocketService } from './services/WebSocketService';

const app = createApp();
const port = process.env.PORT || 5000;

// WebSocket setup
const server = app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

WebSocketService.getInstance(server);
console.log('WebSocket server initialized on /ws');

export default app;