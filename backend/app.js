import express from 'express';
import morgan from 'morgan';
import connect from './db/db.js';
import userRoutes from './routes/user.routes.js';
import projectRoutes from './routes/project.routes.js';
import aiRoutes from './routes/ai.routes.js';
import cookieParser from 'cookie-parser';
import cors from 'cors';
connect();

const app = express();

// Some env sources (Render's dashboard, Docker --env-file) don't strip stray
// whitespace/quotes the way Node's dotenv does — an untrimmed value here
// crashes cors' res.setHeader with ERR_INVALID_CHAR.
const clientUrl = (process.env.CLIENT_URL || 'http://localhost:5173').trim().replace(/^["']|["']$/g, '');

app.use(cors({
    origin: clientUrl,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.use('/users', userRoutes);
app.use('/projects', projectRoutes);
app.use("/ai", aiRoutes);

app.get('/', (req, res) => {
    res.send('Hello World!');
});

export default app;