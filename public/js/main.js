// Connect to WebSocket server
const socket = io();

// DOM Elements
const recordBtn = document.getElementById('recordBtn');
const importBtn = document.getElementById('importBtn');
const recordingModal = document.getElementById('recordingModal');
const uploadModal = document.getElementById('uploadModal');
const stopRecordingBtn = document.getElementById('stopRecording');
const pauseRecordingBtn = document.getElementById('pauseRecording');
const uploadForm = document.getElementById('uploadForm');
const audioFile = document.getElementById('audioFile');
const recordingTime = document.querySelector('.recording-time');
const playBtn = document.getElementById('playButton');
const prevBtn = document.getElementById('prevButton');
const nextBtn = document.getElementById('nextButton');
const progressBar = document.querySelector('.relative.flex-1.mx-3.h-1.bg-neutral-light');
const progressHandle = document.querySelector('.audio-progress-handle');
const progressIndicator = document.querySelector('.audio-progress-indicator');
const currentTimeEl = document.getElementById('currentTime');
const durationEl = document.getElementById('duration');
const noteItems = document.querySelectorAll('.note-item');
const tabs = document.querySelectorAll('.tab');
const issueItems = document.querySelectorAll('.issue-item');

// Create audio element
const audioPlayer = new Audio('/sound/673_clip.wav');

// Annotation Elements
const annotateBtn = document.getElementById('annotateBtn');
const annotationModal = document.getElementById('annotationModal');
const closeAnnotationModal = document.getElementById('closeAnnotationModal');
const cancelAnnotation = document.getElementById('cancelAnnotation');
const saveAnnotation = document.getElementById('saveAnnotation');
const correctedText = document.getElementById('correctedText');
const annotationType = document.getElementById('annotationType');

// Annotation Detail Popup Elements
const annotationDetailPopup = document.getElementById('annotationDetailPopup');
const annotationDetailType = document.getElementById('annotationDetailType');
const annotationDetailStart = document.getElementById('annotationDetailStart');
const annotationDetailEnd = document.getElementById('annotationDetailEnd');
const annotationDetailDuration = document.getElementById('annotationDetailDuration');
const closeAnnotationDetail = document.getElementById('closeAnnotationDetail');

// Sidebar elements
const leftSidebar = document.getElementById('leftSidebar');
const rightSidebar = document.getElementById('rightSidebar');
const toggleLeftSidebar = document.getElementById('toggleLeftSidebar');
const toggleRightSidebar = document.getElementById('toggleRightSidebar');
const showLeftSidebar = document.getElementById('showLeftSidebar');
const showRightSidebar = document.getElementById('showRightSidebar');

// App state
let isRecording = false;
let recordingInterval = null;
let recordingSeconds = 0;
let mediaRecorder = null;
let audioChunks = [];
let audioBlob = null;
let audioContext = null;
let isPlaying = false;
let currentAudioTime = 0;
let selectedTextForAnnotation = null;

// Annotation Filter Elements
let activeAnnotationFilters = ['all']; // Store multiple active filters

// Initialize audio context
try {
  window.AudioContext = window.AudioContext || window.webkitAudioContext;
  audioContext = new AudioContext();
} catch (e) {
  console.warn('Web Audio API is not supported in this browser');
}

// Event Listeners
recordBtn.addEventListener('click', startRecording);
importBtn.addEventListener('click', showImportModal);
stopRecordingBtn.addEventListener('click', stopRecording);
pauseRecordingBtn.addEventListener('click', pauseRecording);
uploadForm.addEventListener('submit', handleUpload);
playBtn.addEventListener('click', togglePlayback);
prevBtn.addEventListener('click', skipPrevious);
nextBtn.addEventListener('click', skipNext);
progressBar.addEventListener('click', seekAudio);

// Annotation event listeners
annotateBtn && annotateBtn.addEventListener('click', showAnnotationModal);
closeAnnotationModal && closeAnnotationModal.addEventListener('click', hideAnnotationModal);
cancelAnnotation && cancelAnnotation.addEventListener('click', hideAnnotationModal);
saveAnnotation && saveAnnotation.addEventListener('click', handleSaveAnnotation);

// Add event listeners to annotation filter buttons - we'll attach these properly in init()
document.querySelectorAll('.annotation-filter').forEach(btn => {
  btn.addEventListener('click', handleAnnotationFilter);
});

// Add event listener to the close button for the annotation detail popup
closeAnnotationDetail && closeAnnotationDetail.addEventListener('click', hideAnnotationDetailPopup);

// Close detail popup when clicking anywhere else on the page
document.addEventListener('click', (e) => {
  if (annotationDetailPopup && 
      !annotationDetailPopup.contains(e.target) && 
      !e.target.classList.contains('highlight')) {
    hideAnnotationDetailPopup();
  }
});

// Function to show the annotation detail popup
function showAnnotationDetailPopup(e) {
  if (!e) return;
  
  // Get highlight element and its data
  const highlight = e.currentTarget || e.target;
  if (!highlight) return;
  
  const type = highlight.getAttribute('data-type');
  const timestampData = highlight.getAttribute('data-timestamp');
  
  if (!timestampData) return;
  
  // Parse timestamp data (format: "start:end")
  const [start, end] = timestampData.split(':').map(Number);
  
  // Check if we have a pre-calculated duration attribute
  let duration;
  const durationAttr = highlight.getAttribute('data-duration');
  if (durationAttr) {
    duration = parseFloat(durationAttr);
  } else {
    duration = (end - start).toFixed(2);
  }
  
  // Format times for display
  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 100);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
  };
  
  // Update popup content
  annotationDetailType.textContent = type.charAt(0).toUpperCase() + type.slice(1);
  annotationDetailStart.textContent = formatTime(start);
  annotationDetailEnd.textContent = formatTime(end);
  annotationDetailDuration.textContent = `${duration}s`;
  
  // Position the popup near the highlight
  const rect = highlight.getBoundingClientRect();
  annotationDetailPopup.style.top = `${rect.bottom + window.scrollY + 8}px`;
  annotationDetailPopup.style.left = `${rect.left + window.scrollX}px`;
  
  // Add a class to highlight the currently selected annotation
  document.querySelectorAll('.highlight-selected').forEach(el => {
    el.classList.remove('highlight-selected');
  });
  highlight.classList.add('highlight-selected');
  
  // Show the popup
  annotationDetailPopup.classList.remove('hidden');
  annotationDetailPopup.classList.add('show');
}

// Function to hide the annotation detail popup
function hideAnnotationDetailPopup() {
  if (annotationDetailPopup) {
    annotationDetailPopup.classList.remove('show');
    annotationDetailPopup.classList.add('hidden');
    
    // Remove the highlight from any selected annotation
    document.querySelectorAll('.highlight-selected').forEach(el => {
      el.classList.remove('highlight-selected');
    });
  }
}

// Function to attach annotation click handlers
function attachAnnotationClickHandlers() {
  // Make sure to query all highlight elements across all patient bubbles
  document.querySelectorAll('.message-bubble.patient .highlight').forEach(highlight => {
    // Remove any existing listeners to prevent duplicates
    highlight.removeEventListener('click', handleHighlightClick);
    highlight.addEventListener('click', handleHighlightClick);
  });
}

// Separate function to handle highlight clicks
function handleHighlightClick(e) {
  e.stopPropagation();
  
  // Show annotation detail popup
  showAnnotationDetailPopup(e);
  
  // Jump to the audio position if there's timestamp data
  const timestampData = this.getAttribute('data-timestamp');
  if (timestampData) {
    const [start] = timestampData.split(':').map(Number);
    audioPlayer.currentTime = start;
    currentAudioTime = start;
    updateTimeDisplay();
    
    // Play the audio from that point
    if (!isPlaying) {
      startPlayback();
    }
  }
}

// Annotation filter handler - fixed to avoid adding multiple event listeners
function handleAnnotationFilter(e) {
  e.preventDefault();
  const filterValue = this.getAttribute('data-type');
  if (!filterValue) return;
  
  console.log('Filter clicked:', filterValue);
  
  // Get all filter buttons for consistent reference
  const filterBtns = document.querySelectorAll('.annotation-filter');

  // Handle "All" button
  if (filterValue === 'all') {
    // Deactivate all other filters
    filterBtns.forEach(btn => {
      if (btn.getAttribute('data-type') !== 'all') {
        btn.classList.remove('active-filter');
        // Update icon state
        const icon = btn.querySelector('.material-icons');
        if (icon) icon.textContent = 'visibility';
      }
    });
    
    // Activate only the "All" button
    this.classList.add('active-filter');
    const icon = this.querySelector('.material-icons');
    if (icon) icon.textContent = 'visibility_on';
    
    // Set activeAnnotationFilters to include only 'all'
    activeAnnotationFilters = ['all'];
    console.log('All filters activated, filters array:', activeAnnotationFilters);
  } else {
    // Get the "All" filter button
    const allFilterBtn = document.querySelector('.annotation-filter[data-type="all"]');
    
    // Remove "All" from active filters if it exists
    if (activeAnnotationFilters.includes('all')) {
      activeAnnotationFilters = [];
      if (allFilterBtn) {
        allFilterBtn.classList.remove('active-filter');
        const allIcon = allFilterBtn.querySelector('.material-icons');
        if (allIcon) allIcon.textContent = 'visibility';
      }
    }

    // Toggle this filter button
    this.classList.toggle('active-filter');
    const icon = this.querySelector('.material-icons');
    
    if (this.classList.contains('active-filter')) {
      // Update icon state
      if (icon) icon.textContent = 'visibility_on';
      
      // Add to active filters if not already present
      if (!activeAnnotationFilters.includes(filterValue)) {
        activeAnnotationFilters.push(filterValue);
      }
    } else {
      // Update icon state
      if (icon) icon.textContent = 'visibility';
      
      // Remove from active filters
      activeAnnotationFilters = activeAnnotationFilters.filter(filter => filter !== filterValue);
    }
    
    // If no filters are active, activate "All" by default
    if (activeAnnotationFilters.length === 0 && allFilterBtn) {
      allFilterBtn.classList.add('active-filter');
      const allIcon = allFilterBtn.querySelector('.material-icons');
      if (allIcon) allIcon.textContent = 'visibility_on';
      activeAnnotationFilters = ['all'];
    }
    
    console.log('Active filters updated:', activeAnnotationFilters);
  }

  // Apply the updated filters to all patient bubbles
  applyFiltersToDocument();
}

// Apply filters to all relevant message bubbles in the document
function applyFiltersToDocument() {
  const messageBubbles = document.querySelectorAll('.message-bubble.patient');
  
  if (messageBubbles.length === 0) {
    console.warn('No message bubbles found to apply filters to');
    return;
  }
  
  messageBubbles.forEach(bubble => {
    applyFilters(bubble);
  });
}

// Apply the current set of active filters to a specific container
function applyFilters(container) {
  if (!container) {
    console.warn('No container provided to applyFilters');
    return;
  }
  
  const highlights = container.querySelectorAll('.highlight');
  
  if (highlights.length === 0) {
    // Skip containers with no highlights
    return;
  }
  
  // Check if 'all' filter is active
  if (activeAnnotationFilters.includes('all')) {
    // Show all highlights
    highlights.forEach(highlight => {
      highlight.classList.remove('highlight-hidden');
    });
    return;
  }
  
  // Otherwise, reset all highlights first (hide them all)
  highlights.forEach(highlight => {
    highlight.classList.add('highlight-hidden');
  });
  
  // Then show only those that match active filters
  activeAnnotationFilters.forEach(filterType => {
    // Try both data-type attribute and class-based matching
    const dataTypeHighlights = container.querySelectorAll(`.highlight[data-type="${filterType}"]`);
    const classHighlights = container.querySelectorAll(`.highlight-${filterType}`);
    
    console.log(`Filter ${filterType}: Found ${dataTypeHighlights.length} by data-type, ${classHighlights.length} by class in this bubble`);
    
    // Show highlights by data-type
    dataTypeHighlights.forEach(highlight => {
      highlight.classList.remove('highlight-hidden');
    });
    
    // Show highlights by class
    classHighlights.forEach(highlight => {
      highlight.classList.remove('highlight-hidden');
    });
  });
}

// Improved sidebar toggle event listeners with animations
toggleLeftSidebar.addEventListener('click', () => {
  // Animate sidebar collapse
  leftSidebar.style.width = '0px';
  leftSidebar.classList.add('sidebar-collapsed');
  
  // Delay showing the restore button until animation completes
  setTimeout(() => {
    showLeftSidebar.classList.remove('hidden');
    showLeftSidebar.classList.add('flex');
  }, 300);
  
  // Save state to localStorage
  localStorage.setItem('leftSidebarVisible', 'false');
});

toggleRightSidebar.addEventListener('click', () => {
  // Animate sidebar collapse
  rightSidebar.style.width = '0px';
  rightSidebar.classList.add('sidebar-collapsed');
  
  // Delay showing the restore button until animation completes
  setTimeout(() => {
    showRightSidebar.classList.remove('hidden');
    showRightSidebar.classList.add('flex');
  }, 300);
  
  // Save state to localStorage
  localStorage.setItem('rightSidebarVisible', 'false');
});

showLeftSidebar.addEventListener('click', () => {
  // Hide restore button first
  showLeftSidebar.classList.add('hidden');
  showLeftSidebar.classList.remove('flex');
  
  // Set fixed width
  leftSidebar.style.width = '15rem'; // 60 * 0.25 = 15rem
  leftSidebar.classList.remove('sidebar-collapsed');
  
  // Save state to localStorage
  localStorage.setItem('leftSidebarVisible', 'true');
});

showRightSidebar.addEventListener('click', () => {
  // Hide restore button first
  showRightSidebar.classList.add('hidden');
  showRightSidebar.classList.remove('flex');
  
  // Set fixed width
  rightSidebar.style.width = '20rem'; // 80 * 0.25 = 20rem
  rightSidebar.classList.remove('sidebar-collapsed');
  
  // Save state to localStorage
  localStorage.setItem('rightSidebarVisible', 'true');
});

// Add click events to all note items
noteItems.forEach(note => {
  note.addEventListener('click', () => {
    noteItems.forEach(n => n.classList.remove('active'));
    note.classList.add('active');
  });
});

// Add click events to tabs
tabs.forEach(tab => {
  tab.addEventListener('click', () => {
    // Update active tab
    tabs.forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    
    // Get the tab name from data attribute
    const tabName = tab.getAttribute('data-tab');
    
    // Show appropriate content
    document.querySelectorAll('.tab-content').forEach(content => {
      content.classList.add('hidden');
      content.classList.remove('active');
    });
    
    const activeContent = document.getElementById(`${tabName}-tab`);
    if (activeContent) {
      activeContent.classList.remove('hidden');
      activeContent.classList.add('active');
    }
  });
});

// Recording functions
function startRecording() {
  if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
    navigator.mediaDevices.getUserMedia({ audio: true })
      .then(stream => {
        // Show modal
        recordingModal.classList.remove('hidden');
        recordingModal.classList.add('flex');
        
        isRecording = true;
        recordingSeconds = 0;
        updateRecordingTime();
        
        // Start recording timer
        recordingInterval = setInterval(() => {
          recordingSeconds++;
          updateRecordingTime();
        }, 1000);
        
        // Create MediaRecorder
        mediaRecorder = new MediaRecorder(stream);
        audioChunks = [];
        
        mediaRecorder.ondataavailable = event => {
          audioChunks.push(event.data);
        };
        
        mediaRecorder.onstop = () => {
          // Create blob from recorded chunks
          audioBlob = new Blob(audioChunks, { type: 'audio/wav' });
          
          // Send to server for analysis
          sendAudioForAnalysis(audioBlob);
        };
        
        // Start recording
        mediaRecorder.start();
        animateRecording();
      })
      .catch(err => {
        console.error('Error accessing microphone:', err);
        alert('Could not access your microphone. Please check permissions.');
      });
  } else {
    alert('Your browser does not support audio recording.');
  }
}

function stopRecording() {
  if (isRecording && mediaRecorder) {
    mediaRecorder.stop();
    isRecording = false;
    clearInterval(recordingInterval);
    
    // Hide modal
    recordingModal.classList.add('hidden');
    recordingModal.classList.remove('flex');
  }
}

function pauseRecording() {
  if (isRecording && mediaRecorder) {
    if (mediaRecorder.state === 'recording') {
      mediaRecorder.pause();
      pauseRecordingBtn.textContent = 'Resume';
      clearInterval(recordingInterval);
    } else if (mediaRecorder.state === 'paused') {
      mediaRecorder.resume();
      pauseRecordingBtn.textContent = 'Pause';
      recordingInterval = setInterval(() => {
        recordingSeconds++;
        updateRecordingTime();
      }, 1000);
    }
  }
}

function updateRecordingTime() {
  const minutes = Math.floor(recordingSeconds / 60).toString().padStart(2, '0');
  const seconds = (recordingSeconds % 60).toString().padStart(2, '0');
  recordingTime.textContent = `${minutes}:${seconds}`;
}

function animateRecording() {
  // Simulate waveform animation
  const waveform = document.getElementById('waveform');
  let opacity = 1;
  let direction = -0.05;
  
  const animate = () => {
    if (!isRecording) return;
    
    opacity += direction;
    if (opacity <= 0.3 || opacity >= 1) {
      direction *= -1;
    }
    
    waveform.style.opacity = opacity;
    requestAnimationFrame(animate);
  };
  
  animate();
}

// Import functions
function showImportModal() {
  uploadModal.classList.remove('hidden');
  uploadModal.classList.add('flex');
}

function handleUpload(e) {
  e.preventDefault();
  
  if (!audioFile.files.length) {
    alert('Please select an audio file.');
    return;
  }
  
  const file = audioFile.files[0];
  const formData = new FormData();
  formData.append('audio', file);
  
  // Show loading state
  const submitBtn = uploadForm.querySelector('button[type="submit"]');
  const originalText = submitBtn.textContent;
  submitBtn.textContent = 'Uploading...';
  submitBtn.disabled = true;
  
  fetch('/upload', {
    method: 'POST',
    body: formData
  })
  .then(response => response.json())
  .then(data => {
    if (data.success) {
      // Send to server for analysis
      sendAudioForAnalysis(file);
      uploadModal.classList.add('hidden');
      uploadModal.classList.remove('flex');
    } else {
      alert('Upload failed.');
    }
  })
  .catch(err => {
    console.error('Error uploading file:', err);
    alert('Error uploading file. Please try again.');
  })
  .finally(() => {
    submitBtn.textContent = originalText;
    submitBtn.disabled = false;
  });
}

// Analysis functions
function sendAudioForAnalysis(audioData) {
  socket.emit('analyze-speech', audioData);
  
  // Show loading state - you could add a loading indicator here
  
  // Listen for analysis results
  socket.once('analysis-results', handleAnalysisResults);
}

function handleAnalysisResults(results) {
  console.log('Analysis results:', results);
  
  // Update metrics
  document.querySelector('.metric-card:nth-child(1) .text-2xl').textContent = results.totalIssues || '25';
  document.querySelector('.metric-card:nth-child(2) .text-2xl').textContent = results.duration || '1:17';
  
  const speechRateElement = document.querySelector('.bg-white.rounded-lg.p-5.text-center .text-4xl');
  const rateQualityElement = document.querySelector('.rate-quality');
  
  if (speechRateElement) {
    speechRateElement.textContent = results.speechRate || '100';
  }
  
  if (rateQualityElement) {
    // Set quality indicator based on speech rate
    const speechRate = results.speechRate || 100;
    let qualityText = 'Average';
    let qualityClass = 'bg-yellow-100 text-yellow-800';
    
    if (speechRate > 90 && speechRate < 110) {
      qualityText = 'Good';
      qualityClass = 'bg-green-100 text-green-800';
    } else if (speechRate >= 110) {
      qualityText = 'Fast';
      qualityClass = 'bg-blue-100 text-blue-800';
    } else if (speechRate <= 70) {
      qualityText = 'Slow';
      qualityClass = 'bg-red-100 text-red-800';
    }
    
    rateQualityElement.textContent = qualityText;
    rateQualityElement.className = `rate-quality ${qualityClass}`;
  }
  
  // Update issue counts
  if (results.issues) {
    const pauseCount = results.issues.find(i => i.type === 'Pauses')?.count || 14;
    const fillerCount = results.issues.find(i => i.type === 'Filler words')?.count || 6;
    const repetitionCount = results.issues.find(i => i.type === 'Repetition')?.count || 4;
    
    // Update progress bars
    const totalIssues = pauseCount + fillerCount + repetitionCount;
    
    // Pause progress
    const pauseBar = document.querySelector('.space-y-2 .flex:nth-child(1) .flex-1 .h-full');
    const pauseCount_el = document.querySelector('.space-y-2 .flex:nth-child(1) .text-sm.font-medium');
    if (pauseBar && pauseCount_el) {
      pauseBar.style.width = `${(pauseCount / totalIssues) * 100}%`;
      pauseCount_el.textContent = pauseCount;
    }
    
    // Filler words progress
    const fillerBar = document.querySelector('.space-y-2 .flex:nth-child(2) .flex-1 .h-full');
    const fillerCount_el = document.querySelector('.space-y-2 .flex:nth-child(2) .text-sm.font-medium');
    if (fillerBar && fillerCount_el) {
      fillerBar.style.width = `${(fillerCount / totalIssues) * 100}%`;
      fillerCount_el.textContent = fillerCount;
    }
    
    // Repetition progress
    const repetitionBar = document.querySelector('.space-y-2 .flex:nth-child(3) .flex-1 .h-full');
    const repetitionCount_el = document.querySelector('.space-y-2 .flex:nth-child(3) .text-sm.font-medium');
    if (repetitionBar && repetitionCount_el) {
      repetitionBar.style.width = `${(repetitionCount / totalIssues) * 100}%`;
      repetitionCount_el.textContent = repetitionCount;
    }
  }
}

// Annotation functions
function showAnnotationModal() {
  // Get current selection if any, otherwise use default example
  const selection = window.getSelection();
  const selectedText = selection.toString().trim();
  
  // Update the modal with the selected text
  const originalTextElement = document.querySelector('#annotationModal .p-3.bg-neutral-lightest');
  
  if (selectedText) {
    selectedTextForAnnotation = {
      text: selectedText,
      range: selection.getRangeAt(0).cloneRange()
    };
    originalTextElement.textContent = selectedText;
    correctedText.value = selectedText; // Start with the selected text
  }
  
  // Show the modal
  annotationModal.classList.remove('hidden');
  annotationModal.classList.add('flex');
}

function hideAnnotationModal() {
  annotationModal.classList.add('hidden');
  annotationModal.classList.remove('flex');
  selectedTextForAnnotation = null;
}

function handleSaveAnnotation() {
  const correction = correctedText.value.trim();
  const type = annotationType.value;
  
  if (!correction) {
    alert('Please enter a correction.');
    return;
  }
  
  if (selectedTextForAnnotation) {
    // Create a span element for the corrected text
    const span = document.createElement('span');
    span.className = `highlight highlight-${type}`;
    span.textContent = correction;
    span.title = `Original: ${selectedTextForAnnotation.text}`;
    
    // If we have a selected range, replace it with our new element
    const range = selectedTextForAnnotation.range;
    range.deleteContents();
    range.insertNode(span);
    
    // Update the total issue count
    const totalIssuesElement = document.querySelector('.metric-card:nth-child(1) .text-2xl');
    if (totalIssuesElement) {
      const currentCount = parseInt(totalIssuesElement.textContent);
      totalIssuesElement.textContent = (currentCount + 1).toString();
    }
    
    // Update the issue count for the specific type
    updateIssueCount(type);
  } else {
    // If no selection, just close the modal
    console.log('No text selected for annotation');
  }
  
  // Close the modal
  hideAnnotationModal();
}

function updateIssueCount(type) {
  // Map the type to the corresponding element
  let countElement;
  
  switch (type) {
    case 'grammar':
      countElement = document.querySelector('.space-y-2 .flex:nth-child(3) .text-sm.font-medium');
      break;
    case 'filler':
      countElement = document.querySelector('.space-y-2 .flex:nth-child(2) .text-sm.font-medium');
      break;
    case 'repetition':
      countElement = document.querySelector('.space-y-2 .flex:nth-child(3) .text-sm.font-medium');
      break;
    case 'mispronunciation':
      // We don't have a specific element for this in the top issues, could add one
      break;
  }
  
  if (countElement) {
    const currentCount = parseInt(countElement.textContent);
    countElement.textContent = (currentCount + 1).toString();
    
    // Also update the progress bar
    const bar = countElement.previousElementSibling.querySelector('.h-full');
    if (bar) {
      // Recalculate percentages based on new values
      const pauseCount = parseInt(document.querySelector('.space-y-2 .flex:nth-child(1) .text-sm.font-medium')?.textContent || '14');
      const fillerCount = parseInt(document.querySelector('.space-y-2 .flex:nth-child(2) .text-sm.font-medium')?.textContent || '6');
      const repetitionCount = parseInt(document.querySelector('.space-y-2 .flex:nth-child(3) .text-sm.font-medium')?.textContent || '4');
      
      const totalCount = pauseCount + fillerCount + repetitionCount;
      
      document.querySelector('.space-y-2 .flex:nth-child(1) .flex-1 .h-full').style.width = `${Math.round((pauseCount / totalCount) * 100)}%`;
      document.querySelector('.space-y-2 .flex:nth-child(2) .flex-1 .h-full').style.width = `${Math.round((fillerCount / totalCount) * 100)}%`;
      document.querySelector('.space-y-2 .flex:nth-child(3) .flex-1 .h-full').style.width = `${Math.round((repetitionCount / totalCount) * 100)}%`;
    }
  }
}

// Process speech text and add highlighting
function processSpeechText(text, issues) {
  if (!text || !issues) return [text];
  
  let processedText = text;
  
  // Calculate total duration for timestamp positioning
  const totalDuration = calculateTotalDuration(issues);
  
  // Process fillers
  if (issues.fillers && issues.fillers.length > 0) {
    issues.fillers.forEach((word, index) => {
      const regex = new RegExp(`\\b${word.text}\\b`, 'gi');
      processedText = processedText.replace(regex, `<span class="highlight highlight-filler filler${index+1}" data-timestamp="${word.start}:${word.end}" data-type="filler">${word.text}</span>`);
    });
  }
  
  // Process repetitions
  if (issues.repetitions && issues.repetitions.length > 0) {
    issues.repetitions.forEach((repetition, index) => {
      const regex = new RegExp(`\\b${repetition.text}\\b`, 'gi');
      processedText = processedText.replace(regex, `<span class="highlight highlight-repetition repetition${index+1}" data-timestamp="${repetition.start}:${repetition.end}" data-type="repetition">${repetition.text}</span>`);
    });
  }
  
  // Process mispronunciations
  if (issues.mispronunciation && issues.mispronunciation.length > 0) {
    issues.mispronunciation.forEach((word, index) => {
      const regex = new RegExp(`\\b${word.text}\\b`, 'gi');
      processedText = processedText.replace(regex, `<span class="highlight highlight-mispronunciation mispronunciation${index+1}" data-timestamp="${word.start}:${word.end}" data-type="mispronunciation">${word.text}</span>`);
    });
  }
  
  // Process grammar issues
  if (issues.grammar && issues.grammar.length > 0) {
    issues.grammar.forEach((word, index) => {
      const regex = new RegExp(`\\b${word.text}\\b`, 'gi');
      processedText = processedText.replace(regex, `<span class="highlight highlight-grammar grammar${index+1}" data-timestamp="${word.start}:${word.end}" data-type="grammar">${word.text}</span>`);
    });
  }
  
  // Process pauses
  if (issues.pauses && issues.pauses.length > 0) {
    // Sort pauses by start time
    const sortedPauses = [...issues.pauses].sort((a, b) => a.start - b.start);
    
    // Calculate suitable positions for pauses
    const textChunks = processedText.split('. '); // Split by sentence
    
    // If we have more pauses than sentences, some will be placed after spaces
    let currentPosition = 0;
    let positions = [];
    
    // First, try to place pauses after sentences
    for (let i = 0; i < textChunks.length - 1 && i < sortedPauses.length; i++) {
      currentPosition += textChunks[i].length + 2; // +2 for the '. '
      positions.push(currentPosition - 1); // -1 to place right after the period
    }
    
    // If we need more positions, try to place after spaces
    if (positions.length < sortedPauses.length) {
      const words = processedText.split(' ');
      currentPosition = 0;
      
      for (let i = 0; i < words.length - 1 && positions.length < sortedPauses.length; i++) {
        currentPosition += words[i].length + 1; // +1 for the space
        // Skip if this position is already after a sentence
        if (!positions.includes(currentPosition - 1)) {
          positions.push(currentPosition);
        }
      }
    }
    
    // Ensure positions are sorted and unique
    positions = [...new Set(positions)].sort((a, b) => a - b);
    
    // Limit positions to the number of pauses we have
    positions = positions.slice(0, sortedPauses.length);
    
    // Insert pauses at the calculated positions
    // Insert from end to beginning to avoid changing positions
    for (let i = positions.length - 1; i >= 0; i--) {
      const pause = sortedPauses[i];
      const duration = (pause.end - pause.start).toFixed(3);
      const pauseElement = `<span class="highlight highlight-pause pause${i+1}" data-timestamp="${pause.start}:${pause.end}" data-type="pause" data-duration="${duration}">...</span>`;
      
      const position = positions[i];
      if (position < processedText.length) {
        processedText = processedText.substring(0, position) + 
                        pauseElement + 
                        processedText.substring(position);
      }
    }
  }
  
  // Split the processed text into sentences
  let sentences = [];
  let tempText = processedText;
  let lastIndex = 0;
  
  // Match periods followed by space or end of string that are not inside tags
  const periodRegex = /\.(?:\s+|$)(?![^<]*>)/g;
  let match;
  
  while ((match = periodRegex.exec(tempText)) !== null) {
    const sentence = tempText.substring(lastIndex, match.index + 1); // Include the period
    if (sentence.trim()) { // Only add non-empty sentences
      sentences.push(sentence);
    }
    lastIndex = match.index + match[0].length;
  }
  
  // Add the last sentence if any text remains
  if (lastIndex < tempText.length) {
    const lastSentence = tempText.substring(lastIndex);
    if (lastSentence.trim()) {
      sentences.push(lastSentence);
    }
  }
  
  // If we couldn't split properly (no periods found outside tags), 
  // fallback to treating the whole text as one sentence
  if (sentences.length === 0) {
    sentences = [processedText];
  }
  
  return sentences;
}

function displayTranscript(transcript) {
  const conversationContainer = document.querySelector('.flex-1.overflow-y-auto.px-6.pb-36 .space-y-5');
  if (!conversationContainer || !transcript) return;
  
  // Clear existing conversation
  conversationContainer.innerHTML = '';
  
  // Add each segment to the conversation
  transcript.forEach(segment => {
    const speakerType = segment.speaker.toLowerCase() === 'child' ? 'patient' : 'doctor';
    const speakerName = segment.speaker.toLowerCase() === 'child' ? 'Patient' : 'Examiner';
    
    if (speakerType === 'patient') {
      // For patient, process the text and split into sentences
      // Process text with annotations/highlights, returns an array of sentences
      const sentences = processSpeechText(segment.text, segment);
      
      // Add speaker name once
      const speakerHTML = `<div class="font-medium mb-1">${speakerName}</div>`;
      conversationContainer.innerHTML += speakerHTML;
      
      // Create a separate message bubble for each sentence
      sentences.forEach(sentence => {
        if (sentence.trim()) {
          const bubbleHTML = `
            <div class="relative mb-3 full-width">
              <div class="message-bubble ${speakerType}">
                ${sentence.trim()}
              </div>
              <div class="message-controls opacity-0 group-hover:opacity-100 absolute right-2 top-2 flex gap-1">
                <button class="message-edit p-1 rounded-full bg-blue-50 hover:bg-blue-100 text-blue-600" data-action="edit" title="Edit transcript">
                  <i class="material-icons" style="font-size: 16px;">edit</i>
                </button>
                <button class="message-copy p-1 rounded-full bg-green-50 hover:bg-green-100 text-green-600" data-action="copy" title="Copy text">
                  <i class="material-icons" style="font-size: 16px;">content_copy</i>
                </button>
                <button class="message-delete p-1 rounded-full bg-red-50 hover:bg-red-100 text-red-600" data-action="delete" title="Delete">
                  <i class="material-icons" style="font-size: 16px;">delete</i>
                </button>
              </div>
            </div>
          `;
          conversationContainer.innerHTML += bubbleHTML;
        }
      });
    } else {
      // For examiner/doctor, keep as a single message
      const segmentHTML = `
        <div class="relative">
          <div class="font-medium mb-1">${speakerName}</div>
          <div class="message-bubble ${speakerType}">
            ${segment.text}
          </div>
        </div>
      `;
      conversationContainer.innerHTML += segmentHTML;
    }
  });
  
  // Attach click handlers to newly added highlights
  attachAnnotationClickHandlers();
  
  // Attach click handlers to transcript edit controls
  initTranscriptEditing();
  
  // Populate the Issues tab with the new highlights
  populateIssueItems();
}

// Playback functions
function togglePlayback() {
  if (isPlaying) {
    pausePlayback();
  } else {
    startPlayback();
  }
}

function startPlayback() {
  // Use the actual audio file in the sound directory
  audioPlayer.currentTime = currentAudioTime;
  
  // Clear all previous event listeners to avoid memory leaks
  audioPlayer.onplay = null;
  audioPlayer.onpause = null;
  audioPlayer.onended = null;
  audioPlayer.ontimeupdate = null;
  audioPlayer.onloadedmetadata = null;
  
  // Set up new event listeners
  audioPlayer.onplay = () => {
    isPlaying = true;
    playBtn.innerHTML = '<i class="material-icons">pause</i>';
  };
  
  audioPlayer.onpause = () => {
    isPlaying = false;
    playBtn.innerHTML = '<i class="material-icons">play_arrow</i>';
    currentAudioTime = audioPlayer.currentTime;
  };
  
  audioPlayer.onended = () => {
    isPlaying = false;
    playBtn.innerHTML = '<i class="material-icons">play_arrow</i>';
    currentAudioTime = 0;
    updateProgressBar(0);
    clearActiveHighlights();
  };
  
  audioPlayer.ontimeupdate = () => {
    if (!audioPlayer.duration) return;
    
    const percent = (audioPlayer.currentTime / audioPlayer.duration) * 100;
    // Only update if it's a significant change to avoid excessive redraws
    if (Math.abs(parseFloat(progressIndicator.style.width) - percent) > 0.5) {
      updateProgressBar(percent);
    }
    updateTimeDisplay();
    highlightCurrentTranscriptSection();
  };

  // Load audio duration once it's available
  audioPlayer.onloadedmetadata = () => {
    updateTimeDisplay();
  };
  
  // Handle errors
  audioPlayer.onerror = (e) => {
    console.error('Audio playback error:', e);
    playBtn.innerHTML = '<i class="material-icons">play_arrow</i>';
    isPlaying = false;
    alert('There was an error playing the audio. Please try again.');
  };
  
  // Start playback
  const playPromise = audioPlayer.play();
  
  // Handle promise to avoid errors in browsers requiring user interaction
  if (playPromise !== undefined) {
    playPromise.catch(error => {
      console.warn('Playback was prevented:', error);
      isPlaying = false;
      playBtn.innerHTML = '<i class="material-icons">play_arrow</i>';
    });
  }
}

function pausePlayback() {
  audioPlayer.pause();
}

function seekAudio(e) {
  e.preventDefault();
  
  // Get the progress bar dimensions
  const rect = progressBar.getBoundingClientRect();
  // Calculate position relative to the progress bar
  let offsetX;
  
  // Handle both mouse clicks and touch events
  if (e.type === 'touchstart' || e.type === 'touchmove') {
    // Get touch position
    const touch = e.touches[0] || e.changedTouches[0];
    offsetX = touch.clientX - rect.left;
  } else {
    // Mouse position
    offsetX = e.clientX - rect.left;
  }
  
  // Ensure offsetX is within bounds
  if (offsetX < 0) offsetX = 0;
  if (offsetX > rect.width) offsetX = rect.width;
  
  const percent = (offsetX / rect.width) * 100;
  updateProgressBar(percent);
  
  // Make sure audio is loaded and has a duration
  if (!audioPlayer.duration) return;
  
  audioPlayer.currentTime = (percent / 100) * audioPlayer.duration;
  currentAudioTime = audioPlayer.currentTime;
  updateTimeDisplay();
  
  // Also update the transcript highlighting
  highlightCurrentTranscriptSection();
}

function updateProgressBar(percent) {
  // Ensure percent is within bounds
  percent = Math.max(0, Math.min(100, percent));
  
  // Update progress indicator width
  progressIndicator.style.width = `${percent}%`;
  
  // Update handle position
  progressHandle.style.left = `${percent}%`;
  
  // For better mobile UX, make the handle larger while dragging
  if (isDragging) {
    progressHandle.classList.add('dragging');
  } else {
    progressHandle.classList.remove('dragging');
  }
}

// Add touch and drag support for the progress bar
let isDragging = false;

// Mouse events
progressBar.addEventListener('mousedown', (e) => {
  isDragging = true;
  document.body.classList.add('no-select'); // Prevent text selection while dragging
  seekAudio(e);
  
  // Add document-level event listeners for dragging
  document.addEventListener('mousemove', handleProgressDrag);
  document.addEventListener('mouseup', stopProgressDrag);
});

// Touch events
progressBar.addEventListener('touchstart', (e) => {
  isDragging = true;
  document.body.classList.add('no-select');
  seekAudio(e);
  
  // Add document-level event listeners for dragging
  document.addEventListener('touchmove', handleProgressDrag, { passive: false });
  document.addEventListener('touchend', stopProgressDrag);
});

// Handle drag events
function handleProgressDrag(e) {
  if (isDragging) {
    e.preventDefault(); // Prevent scrolling on touch devices
    seekAudio(e);
  }
}

// Stop dragging
function stopProgressDrag() {
  if (isDragging) {
    isDragging = false;
    document.body.classList.remove('no-select');
    progressHandle.classList.remove('dragging');
    
    // Remove document-level event listeners
    document.removeEventListener('mousemove', handleProgressDrag);
    document.removeEventListener('mouseup', stopProgressDrag);
    document.removeEventListener('touchmove', handleProgressDrag);
    document.removeEventListener('touchend', stopProgressDrag);
  }
}

// Function to update the time display
function updateTimeDisplay() {
  const formatTime = (seconds) => {
    if (isNaN(seconds) || !isFinite(seconds)) return '0:00';
    
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };
  
  if (currentTimeEl) {
    currentTimeEl.textContent = formatTime(audioPlayer.currentTime);
  }
  
  if (durationEl) {
    durationEl.textContent = formatTime(audioPlayer.duration || 0);
  }
}

// Show/hide modals when clicking outside
window.addEventListener('click', (e) => {
  if (e.target === recordingModal) {
    // Don't close recording modal when clicking outside
    // as it might be an accidental click
  }
  
  if (e.target === uploadModal) {
    uploadModal.classList.add('hidden');
    uploadModal.classList.remove('flex');
  }

  if (e.target === annotationModal) {
    hideAnnotationModal();
  }
});

// Enable text selection in patient speech
document.addEventListener('mouseup', () => {
  const selection = window.getSelection();
  if (selection.toString().trim() && selection.anchorNode) {
    // Check if selection is within a patient message bubble
    let containerElement = selection.anchorNode;
    while (containerElement && containerElement.nodeName !== 'DIV') {
      containerElement = containerElement.parentNode;
    }
    
    if (containerElement && containerElement.classList.contains('patient')) {
      // Make the annotate button more visible when text is selected
      annotateBtn.classList.add('animate-pulse');
      setTimeout(() => {
        annotateBtn.classList.remove('animate-pulse');
      }, 1500);
    }
  }
});

// Load saved sidebar state with improved animation
function loadSidebarState() {
  try {
    // Load left sidebar state
    const leftSidebarVisible = localStorage.getItem('leftSidebarVisible');
    if (leftSidebarVisible === 'false') {
      leftSidebar.style.width = '0px';
      leftSidebar.classList.add('sidebar-collapsed');
      showLeftSidebar.classList.remove('hidden');
      showLeftSidebar.classList.add('flex');
    } else {
      // Ensure fixed width
      leftSidebar.style.width = '15rem'; // 60 * 0.25 = 15rem
    }
    
    // Load right sidebar state
    const rightSidebarVisible = localStorage.getItem('rightSidebarVisible');
    if (rightSidebarVisible === 'false') {
      rightSidebar.style.width = '0px';
      rightSidebar.classList.add('sidebar-collapsed');
      showRightSidebar.classList.remove('hidden');
      showRightSidebar.classList.add('flex');
    } else {
      // Ensure fixed width
      rightSidebar.style.width = '20rem'; // 80 * 0.25 = 20rem
    }
  } catch (e) {
    console.warn('Failed to load sidebar state from localStorage', e);
    // Reset to defaults on error
    leftSidebar.style.width = '15rem';
    rightSidebar.style.width = '20rem';
  }
}

// Initialize the app
function init() {
  // Hide the modals
  recordingModal.classList.add('hidden');
  recordingModal.classList.remove('flex');
  
  uploadModal.classList.add('hidden');
  uploadModal.classList.remove('flex');

  if (annotationModal) {
    annotationModal.classList.add('hidden');
    annotationModal.classList.remove('flex');
  }
  
  // Initialize audio system
  initializeAudioPlayer();
  
  // Initialize annotation filters
  initializeFilters();
  
  // Add click event listeners to all highlights for popup
  attachAnnotationClickHandlers();
  
  // Add click event listeners to all word timestamps
  attachWordTimestampClickHandlers();
  
  // Add click event listeners to issue items
  attachIssueItemClickHandlers();
  
  // Add click event listeners to issue filters
  attachIssueFilterHandlers();
  
  // Populate issues tab with items based on annotations
  populateIssueItems();
  
  // Load saved sidebar state
  loadSidebarState();
  
  // For demo purposes, fake receiving analysis results
  const demoResults = {
    duration: '1:17',
    totalIssues: 25,
    speechRate: 100,
    issues: [
      {type: 'Pauses', count: 14},
      {type: 'Filler words', count: 6},
      {type: 'Repetition', count: 4},
      {type: 'Mispronunciation', count: 1}
    ]
  };
  
  setTimeout(() => {
    handleAnalysisResults(demoResults);
  }, 500);
}

// Set up the audio player
function initializeAudioPlayer() {
  // Make sure we have audio controls in the DOM
  if (!audioPlayer || !progressBar || !progressHandle || !progressIndicator) {
    console.warn('Audio player elements not found in the DOM');
    return;
  }
  
  // Preload audio
  audioPlayer.preload = 'auto';
  
  // Reset state
  currentAudioTime = 0;
  isPlaying = false;
  
  // Set initial button state
  playBtn.innerHTML = '<i class="material-icons">play_arrow</i>';
  
  // Set up initial time display
  if (currentTimeEl) currentTimeEl.textContent = '0:00';
  if (durationEl) durationEl.textContent = '0:00';
  
  // Set initial progress bar state
  updateProgressBar(0);
  
  // Load audio file and metadata
  audioPlayer.addEventListener('loadedmetadata', () => {
    console.log('Audio metadata loaded, duration:', audioPlayer.duration);
    updateTimeDisplay();
  });
  
  // Handle audio end
  audioPlayer.addEventListener('ended', () => {
    isPlaying = false;
    playBtn.innerHTML = '<i class="material-icons">play_arrow</i>';
    currentAudioTime = 0;
    updateProgressBar(0);
    clearActiveHighlights();
  });
  
  // Handle play/pause button
  playBtn.addEventListener('click', togglePlayback);
  
  // Add advanced seeking with touch support
  addAdvancedSeeking();
  
  // Add navigation button functionality
  prevBtn.addEventListener('click', skipPrevious);
  nextBtn.addEventListener('click', skipNext);
  
  // Load the audio file
  audioPlayer.load();
}

// Add advanced seeking with mouse and touch support
function addAdvancedSeeking() {
  // Remove any existing listeners first to prevent duplicates
  progressBar.removeEventListener('mousedown', startSeeking);
  progressBar.removeEventListener('touchstart', startSeeking);
  
  // Add event listeners for mouse and touch
  progressBar.addEventListener('mousedown', startSeeking);
  progressBar.addEventListener('touchstart', startSeeking, { passive: false });
  
  // Make handle responsive to hover
  progressHandle.addEventListener('mouseover', () => {
    progressHandle.classList.add('hover');
  });
  
  progressHandle.addEventListener('mouseout', () => {
    if (!isDragging) {
      progressHandle.classList.remove('hover');
    }
  });
}

// Start seeking functionality
function startSeeking(e) {
  // Prevent default behavior to stop text selection and scrolling
  e.preventDefault();
  
  // Set dragging state
  isDragging = true;
  document.body.classList.add('no-select');
  progressHandle.classList.add('dragging');
  
  // Do the initial seek
  seekAudio(e);
  
  // Add document-level event listeners for dragging
  if (e.type === 'mousedown') {
    document.addEventListener('mousemove', handleProgressDrag);
    document.addEventListener('mouseup', stopProgressDrag);
  } else if (e.type === 'touchstart') {
    document.addEventListener('touchmove', handleProgressDrag, { passive: false });
    document.addEventListener('touchend', stopProgressDrag);
  }
}

// Initialize filter system
function initializeFilters() {
  const annotationFilters = document.querySelectorAll('.annotation-filter');
  if (annotationFilters && annotationFilters.length > 0) {
    console.log('Found annotation filters:', Array.from(annotationFilters).map(f => f.getAttribute('data-type')));
    
    // Remove any existing listeners to avoid duplication
    annotationFilters.forEach(filter => {
      filter.replaceWith(filter.cloneNode(true));
    });
    
    // Get fresh reference after replacing elements
    const refreshedFilters = document.querySelectorAll('.annotation-filter');
    
    // Reset all filters UI state first
    refreshedFilters.forEach(filter => {
      filter.classList.remove('active-filter');
      const icon = filter.querySelector('.material-icons');
      if (icon) icon.textContent = 'visibility';
      
      // Add the click handler (now to the fresh element without previous handlers)
      filter.addEventListener('click', handleAnnotationFilter);
    });
    
    // Set "All" as default active filter
    const allFilter = document.querySelector('.annotation-filter[data-type="all"]');
    if (allFilter) {
      allFilter.classList.add('active-filter');
      const icon = allFilter.querySelector('.material-icons');
      if (icon) icon.textContent = 'visibility_on';
      
      // Initialize the active filters array with 'all'
      activeAnnotationFilters = ['all'];
      
      // Make sure all highlights are visible by default
      document.querySelectorAll('.message-bubble.patient .highlight').forEach(highlight => {
        highlight.classList.remove('highlight-hidden');
      });
    } else {
      console.warn('No "All" filter found, default filter state may be inconsistent');
      activeAnnotationFilters = [];
    }
    
    // Apply initial filter state to all highlights
    applyFiltersToDocument();
  } else {
    console.warn('No annotation filters found in the document');
  }
}

// Add click event handlers to issue items
function attachIssueItemClickHandlers() {
  document.querySelectorAll('.issue-item').forEach(item => {
    item.addEventListener('click', handleIssueItemClick);
  });
}

// Handle click on an issue item in the Issues tab
function handleIssueItemClick() {
  const timestamp = this.getAttribute('data-timestamp');
  if (!timestamp) return;
  
  // Find the corresponding annotation in the transcript
  const [start, end] = timestamp.split(':');
  let matchingHighlight = null;
  
  document.querySelectorAll('.highlight').forEach(highlight => {
    const highlightTimestamp = highlight.getAttribute('data-timestamp');
    if (highlightTimestamp === timestamp) {
      matchingHighlight = highlight;
      return;
    }
  });
  
  if (matchingHighlight) {
    // Scroll to the highlight
    matchingHighlight.scrollIntoView({ behavior: 'smooth', block: 'center' });
    
    // Flash highlight effect
    document.querySelectorAll('.highlight-selected').forEach(el => {
      el.classList.remove('highlight-selected');
    });
    
    matchingHighlight.classList.add('highlight-selected');
    
    // Show annotation details popup
    const event = new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      view: window
    });
    matchingHighlight.dispatchEvent(event);
  }
}

// Function to populate issue items
function populateIssueItems(issues) {
  const container = document.querySelector('.issue-items-container');
  if (!container) return;
  
  container.innerHTML = '';
  
  // Add color legend
  createColorLegend(container);
  
  if (!issues || issues.length === 0) {
    const emptyState = document.createElement('div');
    emptyState.className = 'issues-empty-state text-center p-4';
    emptyState.innerHTML = `
      <div class="text-gray-500">
        <svg class="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <h3 class="mt-2 text-sm font-medium text-gray-900">No issues found</h3>
        <p class="mt-1 text-sm text-gray-500">Your speech is perfect or we haven't analyzed it yet.</p>
      </div>
    `;
    container.appendChild(emptyState);
    return;
  }

  // Sort issues by start time
  issues.sort((a, b) => a.start - b.start);
  
  // ... existing code ...
}

// Function to create color legend
function createColorLegend(container) {
  const legendContainer = document.createElement('div');
  legendContainer.className = 'color-legend flex flex-wrap gap-2 mb-4 p-2 bg-gray-50 rounded-md';
  
  const issueTypes = [
    { type: 'pause', label: 'Pause', color: '#FEF3C7' },
    { type: 'filler', label: 'Filler', color: '#DBEAFE' },
    { type: 'repetition', label: 'Repetition', color: '#E0E7FF' },
    { type: 'mispronunciation', label: 'Mispronunciation', color: '#FEE2E2' },
    { type: 'grammar', label: 'Grammar', color: '#D1FAE5' }
  ];
  
  issueTypes.forEach(item => {
    const legendItem = document.createElement('div');
    legendItem.className = 'color-legend-item flex items-center text-xs gap-1';
    legendItem.setAttribute('data-type', item.type);
    legendItem.innerHTML = `
      <div class="w-3 h-3 rounded-full" style="background-color: ${item.color}"></div>
      <span>${item.label}</span>
    `;
    legendContainer.appendChild(legendItem);
  });
  
  container.appendChild(legendContainer);
}

// Add click handlers for issue filters
function attachIssueFilterHandlers() {
  document.querySelectorAll('.issue-filter').forEach(filter => {
    filter.addEventListener('click', handleIssueFilterClick);
  });
}

function handleIssueFilterClick() {
  document.querySelectorAll('.issue-filter').forEach(filter => {
    filter.classList.remove('active');
  });
  this.classList.add('active');
  applyIssueFilter();
}

function applyIssueFilter() {
  const activeFilter = document.querySelector('.issue-filter.active');
  const filterValue = activeFilter ? activeFilter.getAttribute('data-type') : 'all';
  const issueItems = document.querySelectorAll('.issue-item');
  
  // Keep track of how many items are visible
  let visibleCount = 0;
  
  issueItems.forEach(item => {
    const itemType = item.getAttribute('data-type');
    
    if (filterValue === 'all' || filterValue === itemType) {
      item.classList.remove('hidden');
      visibleCount++;
    } else {
      item.classList.add('hidden');
    }
  });
  
  // Update the color legend items opacity based on the filter
  const legendItems = document.querySelectorAll('.color-legend-item');
  legendItems.forEach(legendItem => {
    const legendType = legendItem.getAttribute('data-type');
    
    if (filterValue === 'all' || filterValue === legendType) {
      legendItem.classList.remove('opacity-50');
    } else {
      legendItem.classList.add('opacity-50');
    }
  });
  
  // Update the visible count badge
  const countBadge = document.querySelector('.issues-count-badge');
  if (countBadge) {
    countBadge.textContent = visibleCount;
  }
  
  // Show/hide empty state message
  const emptyState = document.querySelector('.issues-empty-state');
  if (emptyState) {
    if (visibleCount === 0) {
      emptyState.classList.remove('hidden');
    } else {
      emptyState.classList.add('hidden');
    }
  }
}

// Initialize the color legend items
function initializeColorLegend() {
  const legendItems = document.querySelectorAll('.color-legend-item');
  
  legendItems.forEach(item => {
    item.addEventListener('click', function() {
      const type = this.getAttribute('data-type');
      const filterButtons = document.querySelectorAll('.issue-filter');
      
      // Find the filter button corresponding to this type
      const targetButton = Array.from(filterButtons).find(btn => 
        btn.getAttribute('data-type') === type || 
        (btn.getAttribute('data-type') === 'all' && type === null));
      
      if (targetButton) {
        // Simulate a click on the corresponding filter button
        targetButton.click();
      }
    });
  });
  
  // Apply initial filter state
  const activeFilter = document.querySelector('.issue-filter.active');
  if (!activeFilter && document.querySelector('.issue-filter[data-type="all"]')) {
    document.querySelector('.issue-filter[data-type="all"]').classList.add('active');
  }
  
  applyIssueFilter();
}

// Add event listeners for issue filter buttons
document.addEventListener('DOMContentLoaded', function() {
  const filterButtons = document.querySelectorAll('.issue-filter');
  
  filterButtons.forEach(button => {
    button.addEventListener('click', function() {
      // Remove active class from all filter buttons
      filterButtons.forEach(btn => btn.classList.remove('active'));
      
      // Add active class to the clicked button
      button.classList.add('active');
      
      // Apply the filter
      applyIssueFilter();
    });
  });
  
  // Initialize the color legend
  initializeColorLegend();
});

// Helper function to calculate total duration from issues
function calculateTotalDuration(issues) {
  let maxEnd = 0;
  
  // Check all issue types and find the maximum end time
  const checkIssues = (issueArray) => {
    if (!issueArray) return;
    issueArray.forEach(issue => {
      if (issue.end && issue.end > maxEnd) {
        maxEnd = issue.end;
      }
    });
  };
  
  checkIssues(issues.fillers);
  checkIssues(issues.pauses);
  checkIssues(issues.repetitions);
  checkIssues(issues.mispronunciation);
  checkIssues(issues.grammar);
  
  // If no issues with timestamps, default to 60 seconds
  return maxEnd > 0 ? maxEnd : 60;
}

// Function to skip to previous section
function skipPrevious() {
  // Skip back 10 seconds
  audioPlayer.currentTime = Math.max(0, audioPlayer.currentTime - 10);
  currentAudioTime = audioPlayer.currentTime;
  updateTimeDisplay();
}

// Function to skip to next section
function skipNext() {
  // Skip forward 10 seconds
  audioPlayer.currentTime = Math.min(audioPlayer.duration, audioPlayer.currentTime + 10);
  currentAudioTime = audioPlayer.currentTime;
  updateTimeDisplay();
}

// Function to highlight the section of transcript currently being played
function highlightCurrentTranscriptSection() {
  const currentTime = audioPlayer.currentTime;
  let foundActiveElement = false;
  
  // Clear previous active highlights
  clearActiveHighlights();
  
  // First, check for exact word matches by time
  document.querySelectorAll('.message-bubble.patient .word-timestamp').forEach(element => {
    const timestampData = element.getAttribute('data-timestamp');
    if (timestampData) {
      const [start, end] = timestampData.split(':').map(Number);
      
      if (currentTime >= start && currentTime <= end) {
        element.classList.add('currently-playing');
        foundActiveElement = true;
        
        // Also add a class to the parent bubble for visibility
        const bubble = element.closest('.message-bubble.patient');
        if (bubble) {
          bubble.classList.add('active-bubble');
          
          // Add a class to any highlight that contains this word
          const parentHighlight = element.closest('.highlight:not(.word-timestamp)');
          if (parentHighlight) {
            parentHighlight.classList.add('highlight-active');
          }
        }
      }
    }
  });
  
  // If no word is active, check for annotations (pauses, fillers, etc.)
  if (!foundActiveElement) {
    document.querySelectorAll('.message-bubble.patient .highlight:not(.word-timestamp)').forEach(element => {
      const timestampData = element.getAttribute('data-timestamp');
      if (timestampData) {
        const [start, end] = timestampData.split(':').map(Number);
        
        if (currentTime >= start && currentTime <= end) {
          element.classList.add('currently-playing');
          foundActiveElement = true;
          
          // Also highlight the message bubble containing this annotation
          const bubble = element.closest('.message-bubble.patient');
          if (bubble) {
            bubble.classList.add('active-bubble');
          }
        }
      }
    });
  }
  
  // When active elements change, scroll to keep them in view
  const activeElement = document.querySelector('.currently-playing');
  if (activeElement) {
    // Find the containing message bubble to scroll to
    const messageBubble = activeElement.closest('.message-bubble.patient');
    const bubbleContainer = messageBubble ? messageBubble.closest('.relative.full-width, .relative.ml-4.mb-3') : null;
    const elementToScroll = bubbleContainer || messageBubble || activeElement;
    
    // Only scroll if the element is not already in the visible area
    const container = document.querySelector('.flex-1.overflow-y-auto.px-6.pb-36');
    if (container) {
      const containerRect = container.getBoundingClientRect();
      const elementRect = elementToScroll.getBoundingClientRect();
      
      // Check if element is not fully visible
      if (elementRect.top < containerRect.top || elementRect.bottom > containerRect.bottom) {
        elementToScroll.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }
}

// Function to clear active highlights
function clearActiveHighlights() {
  document.querySelectorAll('.currently-playing, .word-active, .active-bubble, .highlight-active').forEach(el => {
    el.classList.remove('currently-playing');
    el.classList.remove('word-active');
    el.classList.remove('active-bubble');
    el.classList.remove('highlight-active');
  });
}

// Add event listeners to all word timestamps
function attachWordTimestampClickHandlers() {
  const wordTimestamps = document.querySelectorAll('.word-timestamp');
  
  wordTimestamps.forEach(word => {
    word.addEventListener('click', handleWordTimestampClick);
  });
}

// Handle word timestamp click
function handleWordTimestampClick(e) {
  const timestamp = e.currentTarget.getAttribute('data-timestamp');
  
  if (timestamp) {
    // Extract the start time (format: "start:end")
    const startTime = parseFloat(timestamp.split(':')[0]);
    
    // Get the audio element
    const audio = document.getElementById('audioPlayer');
    
    if (audio) {
      // Set the current time to the start time of the word
      audio.currentTime = startTime;
      
      // Check if audio is not already playing, and play it
      if (audio.paused) {
        startPlayback();
      }
      
      // Update the progress indicator
      updateProgressBar((startTime / audio.duration) * 100);
      
      // Highlight the current section of the transcript
      highlightCurrentTranscriptSection();
    }
  }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
  init();
  
  // Initialize transcript editing features
  initTranscriptEditing();
  
  // Initialize Add New Line button
  const addNewLineBtn = document.getElementById('addNewLineBtn');
  if (addNewLineBtn) {
    addNewLineBtn.addEventListener('click', addNewTranscriptLine);
  }
});

// Initialize transcript editing features
function initTranscriptEditing() {
  // Find all message controls
  const messageControls = document.querySelectorAll('.message-controls button');
  
  // Add click handlers to each button
  messageControls.forEach(button => {
    button.addEventListener('click', handleMessageAction);
  });
}

// Handle message control actions (edit, copy, delete)
function handleMessageAction(e) {
  e.preventDefault();
  e.stopPropagation();
  
  const action = this.getAttribute('data-action');
  const messageContainer = this.closest('.relative.mb-3.full-width');
  const messageBubble = messageContainer.querySelector('.message-bubble');
  
  if (!messageBubble) return;
  
  switch (action) {
    case 'edit':
      editMessage(messageBubble);
      break;
    case 'copy':
      copyMessage(messageBubble);
      break;
    case 'delete':
      deleteMessage(messageContainer);
      break;
  }
}

// Edit message functionality
function editMessage(messageBubble) {
    // Store the original content for potential cancel
    messageBubble.originalContent = messageBubble.innerHTML;
    
    // Create and show the enhanced editing popup
    showTranscriptEditPopup(messageBubble);
}

// Enhanced transcript editing popup
function showTranscriptEditPopup(messageBubble) {
    // Create the popup overlay
    const popupOverlay = document.createElement('div');
    popupOverlay.className = 'fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center';
    popupOverlay.id = 'transcriptEditPopup';
    
    // Get existing timestamp data from the bubble
    const existingTimestamps = [];
    const highlightElements = messageBubble.querySelectorAll('[data-timestamp]');
    highlightElements.forEach(el => {
        existingTimestamps.push({
            text: el.textContent,
            timestamp: el.getAttribute('data-timestamp'),
            type: el.getAttribute('data-type') || 'word'
        });
    });
    
    // Create the popup content
    popupOverlay.innerHTML = `
        <div class="bg-white rounded-lg shadow-xl w-full max-w-2xl overflow-hidden">
            <div class="bg-blue-500 text-white px-4 py-3 flex justify-between items-center">
                <h3 class="text-lg font-medium">Edit Transcript</h3>
                <button id="closeEditPopup" class="text-white hover:text-gray-200">
                    <i class="material-icons">close</i>
                </button>
            </div>
            
            <div class="p-6 space-y-4">
                <!-- Text content editing -->
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Edit Text</label>
                    <div id="editableTranscript" contenteditable="true" 
                        class="min-h-24 p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 w-full">
                        ${messageBubble.innerHTML}
                    </div>
                </div>
                
                <!-- Timestamps editing -->
                <div>
                    <div class="flex items-center justify-between mb-2">
                        <label class="block text-sm font-medium text-gray-700">Timestamps</label>
                        <button id="addTimestampBtn" class="text-xs bg-green-100 text-green-700 px-2 py-1 rounded flex items-center gap-1">
                            <i class="material-icons" style="font-size: 14px;">add</i> Add Timestamp
                        </button>
                    </div>
                    <div id="timestampsList" class="space-y-2 max-h-40 overflow-y-auto">
                        ${existingTimestamps.map((ts, index) => `
                            <div class="timestamp-item flex items-center gap-2 p-2 bg-gray-50 rounded">
                                <input type="text" class="timestamp-text flex-1 text-sm p-1 border border-gray-300 rounded" value="${ts.text}" placeholder="Word/phrase">
                                <div class="flex items-center gap-1">
                                    <input type="text" class="timestamp-start w-16 text-sm p-1 border border-gray-300 rounded" placeholder="Start" value="${ts.timestamp.split(':')[0]}">
                                    <span class="text-gray-500">:</span>
                                    <input type="text" class="timestamp-end w-16 text-sm p-1 border border-gray-300 rounded" placeholder="End" value="${ts.timestamp.split(':')[1]}">
                                </div>
                                <select class="timestamp-type text-sm p-1 border border-gray-300 rounded">
                                    <option value="word" ${ts.type === 'word' ? 'selected' : ''}>Word</option>
                                    <option value="filler" ${ts.type === 'filler' ? 'selected' : ''}>Filler</option>
                                    <option value="repetition" ${ts.type === 'repetition' ? 'selected' : ''}>Repetition</option>
                                    <option value="pause" ${ts.type === 'pause' ? 'selected' : ''}>Pause</option>
                                    <option value="mispronunciation" ${ts.type === 'mispronunciation' ? 'selected' : ''}>Mispronunciation</option>
                                    <option value="grammar" ${ts.type === 'grammar' ? 'selected' : ''}>Grammar</option>
                                </select>
                                <button class="remove-timestamp text-red-500 hover:text-red-700">
                                    <i class="material-icons" style="font-size: 18px;">delete</i>
                                </button>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
            
            <div class="bg-gray-50 px-4 py-3 flex justify-end gap-2">
                <button id="cancelEditTranscript" class="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300">
                    Cancel
                </button>
                <button id="saveEditTranscript" class="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600">
                    Save Changes
                </button>
            </div>
        </div>
    `;
    
    // Add the popup to the DOM
    document.body.appendChild(popupOverlay);
    
    // Attach event listeners
    document.getElementById('closeEditPopup').addEventListener('click', () => {
        document.getElementById('transcriptEditPopup').remove();
    });
    
    document.getElementById('cancelEditTranscript').addEventListener('click', () => {
        document.getElementById('transcriptEditPopup').remove();
        cancelEditingMessage(messageBubble);
    });
    
    document.getElementById('saveEditTranscript').addEventListener('click', () => {
        saveTranscriptEdit(messageBubble);
        document.getElementById('transcriptEditPopup').remove();
    });
    
    document.getElementById('addTimestampBtn').addEventListener('click', () => {
        addNewTimestamp();
    });
    
    // Attach remove timestamp listeners
    document.querySelectorAll('.remove-timestamp').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.target.closest('.timestamp-item').remove();
        });
    });
}

// Add a new timestamp field
function addNewTimestamp() {
    const timestampsList = document.getElementById('timestampsList');
    const newItem = document.createElement('div');
    newItem.className = 'timestamp-item flex items-center gap-2 p-2 bg-gray-50 rounded';
    
    newItem.innerHTML = `
        <input type="text" class="timestamp-text flex-1 text-sm p-1 border border-gray-300 rounded" placeholder="Word/phrase">
        <div class="flex items-center gap-1">
            <input type="text" class="timestamp-start w-16 text-sm p-1 border border-gray-300 rounded" placeholder="Start">
            <span class="text-gray-500">:</span>
            <input type="text" class="timestamp-end w-16 text-sm p-1 border border-gray-300 rounded" placeholder="End">
        </div>
        <select class="timestamp-type text-sm p-1 border border-gray-300 rounded">
            <option value="word">Word</option>
            <option value="filler">Filler</option>
            <option value="repetition">Repetition</option>
            <option value="pause">Pause</option>
            <option value="mispronunciation">Mispronunciation</option>
            <option value="grammar">Grammar</option>
        </select>
        <button class="remove-timestamp text-red-500 hover:text-red-700">
            <i class="material-icons" style="font-size: 18px;">delete</i>
        </button>
    `;
    
    timestampsList.appendChild(newItem);
    
    // Attach remove event listener
    newItem.querySelector('.remove-timestamp').addEventListener('click', () => {
        newItem.remove();
    });
    
    // Focus the new input
    newItem.querySelector('.timestamp-text').focus();
}

// Save the transcript edit with timestamps
function saveTranscriptEdit(messageBubble) {
    // Get the edited content
    const editableTranscript = document.getElementById('editableTranscript');
    let editedContent = editableTranscript.innerHTML;
    
    // Get all timestamp items
    const timestampItems = document.querySelectorAll('.timestamp-item');
    
    // Create a temporary div to work with
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = editedContent;
    
    // Replace the content with plain text first
    let plainText = tempDiv.textContent;
    
    // Start building a new HTML content
    let newContent = '';
    let lastIndex = 0;
    
    // Sort timestamps by text length (longer first to avoid replacement conflicts)
    const timestamps = Array.from(timestampItems).map(item => {
        return {
            text: item.querySelector('.timestamp-text').value.trim(),
            start: item.querySelector('.timestamp-start').value.trim(),
            end: item.querySelector('.timestamp-end').value.trim(),
            type: item.querySelector('.timestamp-type').value
        };
    }).filter(ts => ts.text && ts.start && ts.end)
    .sort((a, b) => b.text.length - a.text.length);
    
    // Apply each timestamp to create highlights
    timestamps.forEach(ts => {
        // Find all occurrences of the text
        let regex = new RegExp('\\b' + ts.text + '\\b', 'gi');
        let match;
        let matchFound = false;
        
        while ((match = regex.exec(plainText)) !== null) {
            matchFound = true;
            
            // Add text before this match
            newContent += plainText.substring(lastIndex, match.index);
            
            // Add the highlighted span with timestamp data
            newContent += `<span class="highlight highlight-${ts.type}" data-timestamp="${ts.start}:${ts.end}" data-type="${ts.type}">${match[0]}</span>`;
            
            // Update lastIndex to after this match
            lastIndex = match.index + match[0].length;
            
            // Only process the first match to avoid duplicate replacements
            break;
        }
        
        // If no match found, log for debugging
        if (!matchFound) {
            console.warn(`Could not find match for "${ts.text}" in transcript`);
        }
    });
    
    // Add any remaining text
    newContent += plainText.substring(lastIndex);
    
    // Update the message bubble with the new content
    messageBubble.innerHTML = newContent;
    messageBubble.classList.remove('message-edit-mode');
    
    // Remove any edit controls that might be present
    const editControls = messageBubble.parentElement.querySelector('.edit-controls');
    if (editControls) {
        editControls.remove();
    }
    
    // Re-attach event handlers
    attachWordTimestampClickHandlers();
    attachAnnotationClickHandlers();
    
    // Update the saved transcript in local storage if applicable
    const messageContainer = messageBubble.closest('[data-message-id]');
    const messageId = messageContainer ? messageContainer.dataset.messageId : null;
    if (messageId) {
        const transcriptData = JSON.parse(localStorage.getItem('transcriptData') || '[]');
        const messageIndex = transcriptData.findIndex(msg => msg.id === messageId);
        
        if (messageIndex !== -1) {
            transcriptData[messageIndex].content = messageBubble.innerHTML;
            localStorage.setItem('transcriptData', JSON.stringify(transcriptData));
        }
    }
    
    // Delete the stored original content reference
    delete messageBubble.originalContent;
}

// Cancel editing message function
function cancelEditingMessage(messageBubble) {
    // Restore original content if it exists
    if (messageBubble.originalContent) {
        messageBubble.innerHTML = messageBubble.originalContent;
    }
    
    // Remove editing class if present
    messageBubble.classList.remove('message-edit-mode');
    
    // Remove any edit controls that might be present
    const editControls = messageBubble.parentElement.querySelector('.edit-controls');
    if (editControls) {
        editControls.remove();
    }
    
    // Re-attach necessary event handlers
    attachWordTimestampClickHandlers();
    attachAnnotationClickHandlers();
    
    // Delete the stored original content reference
    delete messageBubble.originalContent;
}

// Copy message text to clipboard
function copyMessage(messageBubble) {
  // Get the text content, preserving only the visible text
  const textContent = messageBubble.innerText.trim();
  
  // Copy to clipboard
  navigator.clipboard.writeText(textContent)
    .then(() => {
      // Show success feedback
      const messageContainer = messageBubble.closest('.relative.mb-3.full-width');
      const copyButton = messageContainer.querySelector('.message-copy');
      
      // Temporarily change the icon to indicate success
      const originalContent = copyButton.innerHTML;
      copyButton.innerHTML = '<i class="material-icons" style="font-size: 16px;">check</i>';
      copyButton.classList.add('bg-green-200');
      
      // Create and show a temporary tooltip
      const tooltip = document.createElement('div');
      tooltip.className = 'absolute right-0 -top-8 bg-green-100 text-green-800 text-xs py-1 px-2 rounded shadow-sm';
      tooltip.textContent = 'Copied!';
      messageContainer.appendChild(tooltip);
      
      // Restore original button after a delay
      setTimeout(() => {
        copyButton.innerHTML = originalContent;
        copyButton.classList.remove('bg-green-200');
        tooltip.remove();
      }, 2000);
    })
    .catch(err => {
      console.error('Failed to copy text: ', err);
      alert('Failed to copy text. Please try again.');
    });
}

// Delete message
function deleteMessage(messageContainer) {
  if (!messageContainer) return;
  
  // Show confirmation dialog
  const confirmDelete = confirm('Are you sure you want to delete this message?');
  
  if (confirmDelete) {
    // Add a fade-out animation
    messageContainer.style.transition = 'opacity 0.3s, transform 0.3s';
    messageContainer.style.opacity = '0';
    messageContainer.style.transform = 'translateX(20px)';
    
    // Remove after animation completes
    setTimeout(() => {
      messageContainer.remove();
      
      // Log deletion (in a real app, you'd update the database)
      console.log('Message deleted');
    }, 300);
  }
}

// Function to add a new transcript line
function addNewTranscriptLine() {
  // Find all elements with font-medium class and find the one that contains "Child"
  const allLabels = document.querySelectorAll('.font-medium.mb-1');
  let patientLabel = null;
  
  // Find the speaker label that contains "Child" or "Patient"
  for (const label of allLabels) {
    if (label.textContent.includes('Child') || label.textContent.includes('Patient')) {
      patientLabel = label;
      break;
    }
  }
  
  if (!patientLabel) {
    console.warn('Could not find patient section');
    return;
  }
  
  const patientSection = patientLabel.parentNode;
  
  // Create a new empty message bubble
  const newBubbleContainer = document.createElement('div');
  newBubbleContainer.className = 'relative mb-3 full-width';
  newBubbleContainer.innerHTML = `
    <div class="message-bubble patient" contenteditable="true" placeholder="Enter new text here..."></div>
    <div class="message-controls opacity-0 group-hover:opacity-100 absolute right-2 top-2 flex gap-1">
      <button class="message-edit p-1 rounded-full bg-blue-50 hover:bg-blue-100 text-blue-600" data-action="edit" title="Edit transcript">
        <i class="material-icons" style="font-size: 16px;">edit</i>
      </button>
      <button class="message-copy p-1 rounded-full bg-green-50 hover:bg-green-100 text-green-600" data-action="copy" title="Copy text">
        <i class="material-icons" style="font-size: 16px;">content_copy</i>
      </button>
      <button class="message-delete p-1 rounded-full bg-red-50 hover:bg-red-100 text-red-600" data-action="delete" title="Delete">
        <i class="material-icons" style="font-size: 16px;">delete</i>
      </button>
    </div>
    <div class="edit-controls absolute right-0 -bottom-8 flex gap-2 bg-white rounded-md p-1 shadow-md z-20">
      <button class="px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200 save-new-line">Save</button>
      <button class="px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200 cancel-new-line">Cancel</button>
    </div>
  `;
  
  // Insert before the "Add New Line" button
  const addButton = document.getElementById('addNewLineBtn').parentNode;
  patientSection.insertBefore(newBubbleContainer, addButton);
  
  // Focus the new bubble for immediate editing
  const newBubble = newBubbleContainer.querySelector('.message-bubble');
  newBubble.focus();
  
  // Add event listeners for the save and cancel buttons
  const saveButton = newBubbleContainer.querySelector('.save-new-line');
  const cancelButton = newBubbleContainer.querySelector('.cancel-new-line');
  
  saveButton.addEventListener('click', () => saveNewLine(newBubbleContainer));
  cancelButton.addEventListener('click', () => cancelNewLine(newBubbleContainer));
  
  // Add Enter key support
  newBubble.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      saveNewLine(newBubbleContainer);
    } else if (e.key === 'Escape') {
      cancelNewLine(newBubbleContainer);
    }
  });
}

// Save a new transcript line
function saveNewLine(container) {
  const bubble = container.querySelector('.message-bubble');
  const text = bubble.innerText.trim();
  
  if (!text) {
    // If empty, just remove it
    cancelNewLine(container);
    return;
  }
  
  // Remove contenteditable attribute
  bubble.removeAttribute('contenteditable');
  
  // Remove the controls panel
  const controls = container.querySelector('.edit-controls');
  if (controls) controls.remove();
  
  // Attach normal control handlers
  const messageControls = container.querySelectorAll('.message-controls button');
  messageControls.forEach(button => {
    button.addEventListener('click', handleMessageAction);
  });
  
  // Log the new line (in a real app, you'd save to database)
  console.log('New line added:', text);
}

// Cancel adding a new line
function cancelNewLine(container) {
  // Simple fade-out animation
  container.style.transition = 'opacity 0.3s';
  container.style.opacity = '0';
  
  // Remove after animation
  setTimeout(() => {
    container.remove();
  }, 300);
} 