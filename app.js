const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const multer = require('multer');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);
const port = process.env.PORT || 3000;

// Set up EJS as template engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Parse JSON bodies
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Set up multer for file uploads
const upload = multer({ dest: 'uploads/' });

// Routes
app.get('/', (req, res) => {
  res.render('index');
});

app.get('/report', (req, res) => {
  res.render('report');
});

// File upload route
app.post('/upload', upload.single('audio'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, message: 'No file uploaded' });
  }
  
  // Here you would process the audio file
  // For demo purposes, we'll just return success
  res.json({ success: true, message: 'File uploaded successfully' });
});

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log('Client connected');
  
  socket.on('analyze-speech', (audioData) => {
    // Simulate speech analysis processing
    setTimeout(() => {
      const analysisResults = {
        duration: '1:17',
        totalIssues: 28,
        speechRate: 100,
        issues: [
          { type: 'Pauses', count: 14 },
          { type: 'Filler words', count: 6 },
          { type: 'Repetitions', count: 4 },
          { type: 'Mispronunciations', count: 1 },
          { type: 'Morphemes', count: 3 }
        ]
      };
      
      socket.emit('analysis-results', analysisResults);
    }, 2000);
  });
  
  socket.on('disconnect', () => {
    console.log('Client disconnected');
  });
});

server.listen(port, () => {
  console.log(`Server is running on port ${port}`);
  console.log(`Main app: http://localhost:${port}`);
  console.log(`Interactive report: http://localhost:${port}/report`);
}); 