const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const multer = require('multer');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Load data from data.json
const rawData = fs.readFileSync(path.join(__dirname, 'data.json'));
const speechData = JSON.parse(rawData);

// Set up middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Set view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Configure multer for audio uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Create uploads directory if it doesn't exist
    const uploadDir = path.join(__dirname, 'public/uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  }
});
const upload = multer({ 
  storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('audio/')) {
      cb(null, true);
    } else {
      cb(new Error('Not an audio file!'), false);
    }
  }
});

// Routes
app.get('/', (req, res) => {
  res.render('index', { data: speechData });
});

app.post('/upload', upload.single('audio'), (req, res) => {
  // Process the uploaded audio file
  res.json({ 
    success: true, 
    filename: req.file.filename,
    path: `/uploads/${req.file.filename}`
  });
});

// WebSocket for real-time speech analysis
io.on('connection', (socket) => {
  console.log('A user connected');
  
  socket.on('analyze-speech', (audioData) => {
    // Use data from data.json for analysis results
    const childSegments = speechData.segments.filter(segment => segment.speaker === "Child");
    
    // Count issues
    let totalIssues = 0;
    let fillerWords = 0;
    let repetitions = 0;
    let pauses = 0;
    let mispronunciations = 0;
    let totalDuration = 0;
    
    childSegments.forEach(segment => {
      fillerWords += segment.fillerwords.length;
      repetitions += segment.repetitions.length;
      pauses += segment.pauses.length;
      mispronunciations += segment.mispronunciation.length;
      
      totalIssues += segment.fillerwords.length + 
                     segment.repetitions.length + 
                     segment.pauses.length + 
                     segment.mispronunciation.length;
                     
      // Calculate total duration
      if (segment.end && segment.start) {
        totalDuration += (segment.end - segment.start);
      }
    });
    
    // Format duration as mm:ss
    const minutes = Math.floor(totalDuration / 60);
    const seconds = Math.floor(totalDuration % 60);
    const formattedDuration = `${minutes}:${seconds.toString().padStart(2, '0')}`;
    
    // Calculate speech rate (rough estimate - words per minute)
    const totalWords = childSegments.reduce((total, segment) => total + segment.words.length, 0);
    const speechRate = Math.round((totalWords / totalDuration) * 60);
    
    const results = {
      duration: formattedDuration,
      totalIssues: totalIssues,
      speechRate: speechRate,
      transcript: speechData.segments,
      topIssues: {
        syllable: mispronunciations,
        filterWords: fillerWords,
        grammar: repetitions
      },
      issues: [
        {type: 'Mispronunciation', count: mispronunciations},
        {type: 'Pauses', count: pauses},
        {type: 'Repetition', count: repetitions},
        {type: 'Filler words', count: fillerWords}
      ]
    };
    
    socket.emit('analysis-results', results);
  });
  
  socket.on('disconnect', () => {
    console.log('User disconnected');
  });
});

// Create uploads directory if it doesn't exist
const uploadDir = path.join(__dirname, 'public/uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Start the server
const PORT = process.env.PORT || 1234;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
}); 