# SATE - Speech Analysis Tool and Evaluator

SATE is a web application that helps analyze speech patterns, identify issues like filler words, repetition, and grammar mistakes, and provides feedback for improving communication skills.

## Features

- 🎙️ Record audio directly from the browser
- 📁 Import existing audio files
- 📊 Analyze speech patterns and identify issues
- 📝 View transcripts with highlighted speech problems
- 📈 Get statistics on speech rate and issue frequency
- 🔄 Save and review multiple speech sessions
- 🎨 Modern UI with Tailwind CSS
- 📱 Responsive design that works on all devices

## Screenshot

![SATE Application Screenshot](https://via.placeholder.com/800x600?text=SATE+Screenshot)

## Installation

1. Make sure you have [Node.js](https://nodejs.org/) installed (version 14.x or higher)
2. Clone this repository
3. Install dependencies:

```bash
npm install
```

4. Build the CSS:

```bash
npm run build:css
```

## Running the Application

Start the development server:

```bash
npm run dev
```

Or start the production server:

```bash
npm start
```

Then open your browser and navigate to `http://localhost:3000`

## Usage

1. Click the "Record" button to start recording your speech
2. Speak naturally into your microphone
3. Click "Stop" when finished
4. View the analysis results and transcript
5. Use the playback controls to listen to your recording
6. Review the highlighted issues to identify areas for improvement

## Technologies Used

- Node.js
- Express.js
- Socket.IO
- Web Audio API
- MediaRecorder API
- EJS Templates
- Tailwind CSS

## Development

To modify the Tailwind CSS styles:

1. Edit the `public/css/tailwind-input.css` file
2. Rebuild the CSS:

```bash
npm run build:css
```

To customize the Tailwind configuration:

1. Edit the `tailwind.config.js` file
2. Rebuild the CSS to apply your changes

## License

ISC

## Author

[Your Name] 