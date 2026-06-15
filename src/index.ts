import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

import authRoutes from './routes/authRoutes';
import userRoutes from './routes/userRoutes';
import debateRoutes from './routes/debateRoutes';
import verdictRoutes from './routes/verdictRoutes';
import commentRoutes from './routes/commentRoutes';
import voteRoutes from './routes/voteRoutes';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', message: 'Debately API is running' });
});

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/debates', debateRoutes);
app.use('/api/verdicts', verdictRoutes);
app.use('/api/comments', commentRoutes);
app.use('/api/votes', voteRoutes);

app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

app.listen(PORT, () => {
  console.log(`Debately API running on port ${PORT}`);
});

export default app;