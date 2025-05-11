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
      !e.target.classList.contains('highlight') &&
      !e.target.closest('.highlight-morpheme')) {
    hideAnnotationDetailPopup();
  }
});

// Function to show the annotation detail popup
function showAnnotationDetailPopup(e) {
  if (!e) return;
  
  // Get highlight element and its data
  const highlight = e.currentTarget || e.target;
  if (!highlight) return;
  
  // Skip morpheme highlights as they have their own popup
  if (highlight.classList.contains('highlight-morpheme')) return;
  
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
  console.log("Attaching annotation click handlers");
  
  // Make sure to query all highlight elements across all patient bubbles
  // Exclude morpheme highlights as they have their own popup system
  const highlights = document.querySelectorAll('.message-bubble.patient .highlight:not(.highlight-morpheme)');
  console.log(`Found ${highlights.length} highlights to attach handlers to`);
  
  highlights.forEach(highlight => {
    // Remove any existing listeners to prevent duplicates
    highlight.removeEventListener('click', handleHighlightClick);
    // Add new listener
    highlight.addEventListener('click', handleHighlightClick);
  });
  
  console.log("Annotation click handlers attached successfully");
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
  
  // Get the icon in this button
  const icon = this.querySelector('.material-icons');
  const buttonText = this.textContent.trim().replace('visibility', '').replace('visibility_on', '').replace('visibility_off', '').trim();

  // Handle "All" button
  if (filterValue === 'all') {
    // Toggle between show all and hide all
    if (activeAnnotationFilters.includes('all')) {
      // Currently showing all, switch to hiding all
      activeAnnotationFilters = ['hide_all'];
      
      // Update button text and icon
      if (icon) icon.textContent = 'visibility_off';
      this.setAttribute('data-original-text', buttonText);
      this.textContent = '';
      this.appendChild(icon);
      this.appendChild(document.createTextNode(' Hide All'));
      
      // Update all other filter buttons to show as inactive (eye closed)
      filterBtns.forEach(btn => {
        if (btn.getAttribute('data-type') !== 'all') {
          btn.classList.remove('active-filter');
          const btnIcon = btn.querySelector('.material-icons');
          if (btnIcon) btnIcon.textContent = 'visibility_off';
        }
      });
    } else {
      // Currently hiding all or showing specific filters, switch to showing all
      activeAnnotationFilters = ['all'];
      
      // Update button text and icon
      if (icon) icon.textContent = 'visibility';
      this.textContent = '';
      this.appendChild(icon);
      this.appendChild(document.createTextNode(' Show All'));
      
      // Update all other filter buttons to show as inactive but with open eyes
      filterBtns.forEach(btn => {
        if (btn.getAttribute('data-type') !== 'all') {
          btn.classList.remove('active-filter');
          const btnIcon = btn.querySelector('.material-icons');
          if (btnIcon) btnIcon.textContent = 'visibility';
        }
      });
    }
    
    // Always make the All button active
    this.classList.add('active-filter');
    
    console.log('All filter toggled, active filters:', activeAnnotationFilters);
  } else {
    // Get the "All" filter button
    const allFilterBtn = document.querySelector('.annotation-filter[data-type="all"]');
    
    // Remove "All" and "hide_all" from active filters if they exist
    if (activeAnnotationFilters.includes('all') || activeAnnotationFilters.includes('hide_all')) {
      activeAnnotationFilters = [];
      if (allFilterBtn) {
        allFilterBtn.classList.remove('active-filter');
        const allIcon = allFilterBtn.querySelector('.material-icons');
        if (allIcon) allIcon.textContent = 'visibility';
        
        // Reset All button text
        allFilterBtn.textContent = '';
        allFilterBtn.appendChild(allIcon);
        allFilterBtn.appendChild(document.createTextNode(' Show All'));
      }
      
      // Set all individual filter buttons to have closed eyes initially
      filterBtns.forEach(btn => {
        if (btn.getAttribute('data-type') !== 'all' && btn !== this) {
          const btnIcon = btn.querySelector('.material-icons');
          if (btnIcon) btnIcon.textContent = 'visibility_off';
          btn.classList.remove('active-filter');
        }
      });
    }

    // Toggle this filter button
    this.classList.toggle('active-filter');
    
    if (this.classList.contains('active-filter')) {
      // Update icon state
      if (icon) icon.textContent = 'visibility';
      
      // Add to active filters if not already present
      if (!activeAnnotationFilters.includes(filterValue)) {
        activeAnnotationFilters.push(filterValue);
      }
    } else {
      // Update icon state
      if (icon) icon.textContent = 'visibility_off';
      
      // Remove from active filters
      activeAnnotationFilters = activeAnnotationFilters.filter(filter => filter !== filterValue);
    }
    
    // If no filters are active, activate "All" by default
    if (activeAnnotationFilters.length === 0 && allFilterBtn) {
      allFilterBtn.classList.add('active-filter');
      const allIcon = allFilterBtn.querySelector('.material-icons');
      if (allIcon) allIcon.textContent = 'visibility';
      activeAnnotationFilters = ['all'];
      
      // Reset all other buttons to show visibility icon
      filterBtns.forEach(btn => {
        if (btn.getAttribute('data-type') !== 'all') {
          const btnIcon = btn.querySelector('.material-icons');
          if (btnIcon) btnIcon.textContent = 'visibility';
          btn.classList.remove('active-filter');
        }
      });
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
  
  // Update visibility indicators in the control bar
  updateAnnotationVisibilityIndicators();
}

// Function to update annotation visibility indicators in the control bar
function updateAnnotationVisibilityIndicators() {
  // Check if we're hiding all annotations
  const hideAll = activeAnnotationFilters.includes('hide_all');
  const showAll = activeAnnotationFilters.includes('all');
  
  // Get all message bubbles
  const messageBubbles = document.querySelectorAll('.message-bubble.patient');
  
  // For each bubble, update its control bar indicators
  messageBubbles.forEach(bubble => {
    // Get all annotation types in this bubble
    const annotationStats = new Map();
    let totalAnnotations = 0;
    
    // Count annotations by type
    bubble.querySelectorAll('.highlight').forEach(highlight => {
      const type = highlight.getAttribute('data-type');
      if (!type) return;
      
      if (!annotationStats.has(type)) {
        annotationStats.set(type, 0);
      }
      annotationStats.set(type, annotationStats.get(type) + 1);
      totalAnnotations++;
    });
    
    // Skip if no annotations
    if (totalAnnotations === 0) return;
    
    // Get the control bar for this bubble
    const controls = bubble.closest('.relative').querySelector('.message-controls');
    if (!controls) return;
    
    // Remove any existing visibility indicators
    controls.querySelectorAll('.annotation-visibility-indicator, .annotation-counter').forEach(indicator => {
      indicator.remove();
    });
    
    // Remove the visibility-active class
    controls.classList.remove('visibility-active');
    
    // Calculate which annotation types are visible based on current filters
    const hiddenTypes = [];
    const visibleTypes = [];
    
    if (hideAll) {
      // All types are hidden
      hiddenTypes.push(...annotationStats.keys());
    } else if (showAll) {
      // All types are visible
      visibleTypes.push(...annotationStats.keys());
    } else {
      // Check each type
      for (const [type, count] of annotationStats.entries()) {
        if (activeAnnotationFilters.includes(type)) {
          visibleTypes.push(type);
        } else {
          hiddenTypes.push(type);
        }
      }
    }
    
    // Create visualization element
    const annotationCounter = document.createElement('div');
    annotationCounter.className = 'annotation-counter px-2 py-1 rounded-md flex items-center gap-1';
    
    let tooltipText = '';
    
    if (totalAnnotations > 0) {
      // Create counter with detailed breakdown
      const hiddenCount = hiddenTypes.reduce((sum, type) => sum + (annotationStats.get(type) || 0), 0);
      const visibleCount = totalAnnotations - hiddenCount;
      
      if (hideAll || hiddenCount === totalAnnotations) {
        // All annotations are hidden
        annotationCounter.className += ' bg-gray-100 text-gray-600';
        annotationCounter.innerHTML = `
          <i class="material-icons" style="font-size: 16px;">visibility_off</i>
          <span class="text-xs">${totalAnnotations}</span>
        `;
        tooltipText = `All ${totalAnnotations} annotations are hidden`;
      } else if (showAll || hiddenCount === 0) {
        // All annotations are visible
        annotationCounter.className += ' bg-blue-50 text-blue-600';
        annotationCounter.innerHTML = `
          <i class="material-icons" style="font-size: 16px;">visibility</i>
          <span class="text-xs">${totalAnnotations}</span>
        `;
        tooltipText = `All ${totalAnnotations} annotations are visible`;
      } else {
        // Some annotations are hidden, some are visible
        annotationCounter.className += ' bg-yellow-50 text-yellow-600';
        annotationCounter.innerHTML = `
          <i class="material-icons" style="font-size: 16px;">visibility</i>
          <span class="text-xs">${visibleCount}/${totalAnnotations}</span>
        `;
        tooltipText = `${visibleCount} of ${totalAnnotations} annotations are visible`;
      }
      
      // Add detailed tooltip
      let tooltipDetails = '';
      
      // Add visible types to tooltip
      if (visibleTypes.length > 0) {
        tooltipDetails += 'Visible: ';
        visibleTypes.forEach(type => {
          tooltipDetails += `${type} (${annotationStats.get(type)}), `;
        });
        tooltipDetails = tooltipDetails.slice(0, -2) + '\n';
      }
      
      // Add hidden types to tooltip
      if (hiddenTypes.length > 0) {
        tooltipDetails += 'Hidden: ';
        hiddenTypes.forEach(type => {
          tooltipDetails += `${type} (${annotationStats.get(type)}), `;
        });
        tooltipDetails = tooltipDetails.slice(0, -2);
      }
      
      if (tooltipDetails) {
        tooltipText += '\n' + tooltipDetails;
      }
      
      annotationCounter.setAttribute('title', tooltipText);
      
      // Insert at the start of controls
      if (controls.firstChild) {
        controls.insertBefore(annotationCounter, controls.firstChild);
      } else {
        controls.appendChild(annotationCounter);
      }
      
      // Add click handler to toggle visibility
      annotationCounter.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        // If all hidden, show all
        if (hideAll || hiddenCount === totalAnnotations) {
          // Find and click the "Show All" button
          const showAllBtn = document.querySelector('.annotation-filter[data-type="all"]');
          if (showAllBtn) showAllBtn.click();
        } 
        // If all visible, hide all
        else if (showAll || hiddenCount === 0) {
          // If "all" filter is active, click it again to hide all
          const allBtn = document.querySelector('.annotation-filter[data-type="all"]');
          if (allBtn && activeAnnotationFilters.includes('all')) {
            allBtn.click();
          }
        }
        // If mixed, show all 
        else {
          // Find and click the "Show All" button
          const showAllBtn = document.querySelector('.annotation-filter[data-type="all"]');
          if (showAllBtn) showAllBtn.click();
        }
      });
      
      // Add class to ensure controls stay visible
      controls.classList.add('visibility-active');
    }
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
  
  // Check if 'all' filter is active - show all highlights
  if (activeAnnotationFilters.includes('all')) {
    // Show all highlights
    highlights.forEach(highlight => {
      highlight.classList.remove('highlight-hidden');
    });
    return;
  }
  
  // Check if 'hide_all' filter is active - hide all highlights
  if (activeAnnotationFilters.includes('hide_all')) {
    // Hide all highlights
    highlights.forEach(highlight => {
      highlight.classList.add('highlight-hidden');
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
  document.querySelector('.metric-card:nth-child(1) .text-2xl').textContent = results.totalIssues || '28';
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
    const morphemeCount = results.issues.find(i => i.type === 'Morphemes')?.count || 3;
    const mispronunciationCount = results.issues.find(i => i.type === 'Mispronunciation')?.count || 1;
    
    // Update progress bars
    const totalIssues = pauseCount + fillerCount + repetitionCount + morphemeCount + mispronunciationCount;
    
    // Pause progress (1st item)
    const pauseBar = document.querySelector('.space-y-2 .flex:nth-child(1) .flex-1 .h-full');
    const pauseCount_el = document.querySelector('.space-y-2 .flex:nth-child(1) .text-sm.font-medium');
    if (pauseBar && pauseCount_el) {
      pauseBar.style.width = `${(pauseCount / totalIssues) * 100}%`;
      pauseBar.style.backgroundColor = '#60a5fa'; // blue-400
      pauseCount_el.textContent = pauseCount;
    }
    
    // Filler words progress (2nd item)
    const fillerBar = document.querySelector('.space-y-2 .flex:nth-child(2) .flex-1 .h-full');
    const fillerCount_el = document.querySelector('.space-y-2 .flex:nth-child(2) .text-sm.font-medium');
    if (fillerBar && fillerCount_el) {
      fillerBar.style.width = `${(fillerCount / totalIssues) * 100}%`;
      fillerBar.style.backgroundColor = '#fb923c'; // orange-400
      fillerCount_el.textContent = fillerCount;
    }
    
    // Repetition progress (3rd item)
    const repetitionBar = document.querySelector('.space-y-2 .flex:nth-child(3) .flex-1 .h-full');
    const repetitionCount_el = document.querySelector('.space-y-2 .flex:nth-child(3) .text-sm.font-medium');
    if (repetitionBar && repetitionCount_el) {
      repetitionBar.style.width = `${(repetitionCount / totalIssues) * 100}%`;
      repetitionBar.style.backgroundColor = '#fbbf24'; // amber-400
      repetitionCount_el.textContent = repetitionCount;
    }
    
    // Morphemes progress (4th item)
    const morphemeBar = document.querySelector('.space-y-2 .flex:nth-child(4) .flex-1 .h-full');
    const morphemeCount_el = document.querySelector('.space-y-2 .flex:nth-child(4) .text-sm.font-medium');
    if (morphemeBar && morphemeCount_el) {
      morphemeBar.style.width = `${(morphemeCount / totalIssues) * 100}%`;
      morphemeBar.style.backgroundColor = '#818cf8'; // indigo-400
      morphemeCount_el.textContent = morphemeCount;
    }
    
    // Check for mispronunciation bar (5th item if it exists)
    const mispronunciationBar = document.querySelector('.space-y-2 .flex:nth-child(5) .flex-1 .h-full');
    const mispronunciationCount_el = document.querySelector('.space-y-2 .flex:nth-child(5) .text-sm.font-medium');
    if (mispronunciationBar && mispronunciationCount_el) {
      mispronunciationBar.style.width = `${(mispronunciationCount / totalIssues) * 100}%`;
      mispronunciationBar.style.backgroundColor = '#c084fc'; // purple-400
      mispronunciationCount_el.textContent = mispronunciationCount;
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
      countElement = document.querySelector('.space-y-2 .flex:nth-child(4) .text-sm.font-medium');
      break;
    case 'filler':
      countElement = document.querySelector('.space-y-2 .flex:nth-child(2) .text-sm.font-medium');
      break;
    case 'repetition':
      countElement = document.querySelector('.space-y-2 .flex:nth-child(3) .text-sm.font-medium');
      break;
    case 'mispronunciation':
      countElement = document.querySelector('.space-y-2 .flex:nth-child(5) .text-sm.font-medium');
      break;
    case 'morpheme':
      countElement = document.querySelector('.space-y-2 .flex:nth-child(4) .text-sm.font-medium');
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
      const morphemeCount = parseInt(document.querySelector('.space-y-2 .flex:nth-child(4) .text-sm.font-medium')?.textContent || '3');
      const mispronunciationCount = parseInt(document.querySelector('.space-y-2 .flex:nth-child(5) .text-sm.font-medium')?.textContent || '1');
      
      const totalCount = pauseCount + fillerCount + repetitionCount + morphemeCount + mispronunciationCount;
      
      document.querySelector('.space-y-2 .flex:nth-child(1) .flex-1 .h-full').style.width = `${Math.round((pauseCount / totalCount) * 100)}%`;
      document.querySelector('.space-y-2 .flex:nth-child(2) .flex-1 .h-full').style.width = `${Math.round((fillerCount / totalCount) * 100)}%`;
      document.querySelector('.space-y-2 .flex:nth-child(3) .flex-1 .h-full').style.width = `${Math.round((repetitionCount / totalCount) * 100)}%`;
      document.querySelector('.space-y-2 .flex:nth-child(4) .flex-1 .h-full').style.width = `${Math.round((morphemeCount / totalCount) * 100)}%`;
      
      // Only update mispronunciation if the element exists
      const mispronunciationBar = document.querySelector('.space-y-2 .flex:nth-child(5) .flex-1 .h-full');
      if (mispronunciationBar) {
        mispronunciationBar.style.width = `${Math.round((mispronunciationCount / totalCount) * 100)}%`;
      }
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
    totalIssues: 28,
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
      if (icon) icon.textContent = 'visibility_off'; // Default to "eye closed" for all filters
      
      // Add the click handler (now to the fresh element without previous handlers)
      filter.addEventListener('click', handleAnnotationFilter);
    });
    
    // Set "All" as default active filter
    const allFilter = document.querySelector('.annotation-filter[data-type="all"]');
    if (allFilter) {
      allFilter.classList.add('active-filter');
      const icon = allFilter.querySelector('.material-icons');
      if (icon) {
        icon.textContent = 'visibility';
        
        // Set the correct text for the all button
        allFilter.textContent = '';
        allFilter.appendChild(icon);
        allFilter.appendChild(document.createTextNode(' Show All'));
      }
      
      // Initialize the active filters array with 'all'
      activeAnnotationFilters = ['all'];
      
      // When "all" is active, all filter buttons should have visibility icon
      refreshedFilters.forEach(filter => {
        if (filter.getAttribute('data-type') !== 'all') {
          const filterIcon = filter.querySelector('.material-icons');
          if (filterIcon) filterIcon.textContent = 'visibility';
        }
      });
      
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
    
    // Ensure visibility indicators are initialized
    updateAnnotationVisibilityIndicators();
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
    { type: 'pause', label: 'Pause', color: '#60a5fa' }, // blue-400
    { type: 'filler', label: 'Filler', color: '#fb923c' }, // orange-400
    { type: 'repetition', label: 'Repetition', color: '#fbbf24' }, // amber-400
    { type: 'morpheme', label: 'Morpheme', color: '#818cf8' }, // indigo-400
    { type: 'mispronunciation', label: 'Mispronunciation', color: '#c084fc' }, // purple-400
    { type: 'grammar', label: 'Grammar', color: '#10b981' }  // emerald-500
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
        // Temporarily make visible even if filter is hiding it
        element.classList.remove('highlight-hidden');
        foundActiveElement = true;
        
        // Also add a class to the parent bubble for visibility
        const bubble = element.closest('.message-bubble.patient');
        if (bubble) {
          bubble.classList.add('active-bubble');
          
          // Add a class to any highlight that contains this word
          const parentHighlight = element.closest('.highlight:not(.word-timestamp)');
          if (parentHighlight) {
            parentHighlight.classList.add('highlight-active');
            // Temporarily make visible even if filter is hiding it
            parentHighlight.classList.remove('highlight-hidden');
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
          // Temporarily make visible even if filter is hiding it
          element.classList.remove('highlight-hidden');
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
  console.log("Attaching word timestamp click handlers");
  const wordTimestamps = document.querySelectorAll('.word-timestamp');
  console.log(`Found ${wordTimestamps.length} word timestamps to attach handlers to`);
  
  // First remove any existing handlers to prevent duplicates
  wordTimestamps.forEach(word => {
    word.removeEventListener('click', handleWordTimestampClick);
    // Now add the event listener
    word.addEventListener('click', handleWordTimestampClick);
  });
  
  console.log("Word timestamp handlers attached successfully");
}

// Handle word timestamp click
function handleWordTimestampClick(e) {
  e.preventDefault();
  e.stopPropagation();
  // Use e.currentTarget to ensure we get the element with the event listener
  const timestamp = e.currentTarget.getAttribute('data-timestamp');
  
  if (timestamp) {
    // Extract the start time (format: "start:end")
    const [startTime, endTime] = timestamp.split(':').map(Number);
    
    // Use the global audioPlayer variable instead of getElementById
    if (audioPlayer) {
      // Set the current time to the start time of the word
      audioPlayer.currentTime = startTime;
      currentAudioTime = startTime;
      
      // Update the progress indicator
      if (audioPlayer.duration) {
        updateProgressBar((startTime / audioPlayer.duration) * 100);
      }
      
      // Update the time display
      updateTimeDisplay();
      
      // Check if audio is not already playing, and play it
      if (audioPlayer.paused) {
        startPlayback();
      }
      
      // Highlight the current section of the transcript
      highlightCurrentTranscriptSection();
      
      console.log(`Jumped to timestamp: ${startTime}s for word: "${e.currentTarget.textContent}"`);
    } else {
      console.error('Audio player not found');
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
    console.log('Initializing transcript editing...');
    
    // Find all message controls
    const messageControls = document.querySelectorAll('.message-controls button');
    console.log('Found message control buttons:', messageControls.length);
    
    // Add click handlers to each button
    messageControls.forEach(button => {
        const action = button.getAttribute('data-action');
        console.log('Adding handler for button with action:', action);
        
        // Remove any existing event listeners to avoid duplication
        const newButton = button.cloneNode(true);
        button.parentNode.replaceChild(newButton, button);
        
        // Add the click event listener
        newButton.addEventListener('click', handleMessageAction);
    });
    
    // Also add hover behavior to make controls visible
    const messageContainers = document.querySelectorAll('.relative.mb-3.full-width');
    messageContainers.forEach(container => {
        const controls = container.querySelector('.message-controls');
        if (controls) {
            container.addEventListener('mouseenter', () => {
                controls.style.opacity = '1';
            });
            
            container.addEventListener('mouseleave', () => {
                controls.style.opacity = '0';
            });
        }
    });
}

// Handle message control actions (edit, copy, delete)
function handleMessageAction(e) {
  console.log('Message action triggered:', e.type, this.getAttribute('data-action'));
  e.preventDefault();
  e.stopPropagation();
  
  const action = this.getAttribute('data-action');
  const messageContainer = this.closest('.relative.mb-3.full-width');
  const messageBubble = messageContainer.querySelector('.message-bubble');
  
  console.log('Message container found:', !!messageContainer);
  console.log('Message bubble found:', !!messageBubble);
  
  if (!messageBubble) return;
  
  switch (action) {
    case 'edit':
      console.log('Edit action triggered');
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
    console.log('Edit message function called with bubble:', messageBubble);
    // Store the original content for potential cancel
    messageBubble.originalContent = messageBubble.innerHTML;
    
    // Create and show the enhanced editing popup
    showTranscriptEditPopup(messageBubble);
}

// Enhanced transcript editing popup
function showTranscriptEditPopup(messageBubble) {
    console.log('Creating edit popup with timestamp support');
    
    // Create the popup overlay
    const popupOverlay = document.createElement('div');
    popupOverlay.id = 'transcriptEditPopup';
    
    // Apply direct styles for visibility
    Object.assign(popupOverlay.style, {
        position: 'fixed',
        top: '0',
        left: '0',
        width: '100%',
        height: '100%',
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)', // For Safari
        zIndex: '9999',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
    });
    
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
    
    console.log('Found timestamps:', existingTimestamps.length);
    
    // Create popup content container
    const popupContent = document.createElement('div');
    
    // Apply direct styles for content
    Object.assign(popupContent.style, {
        backgroundColor: 'white',
        borderRadius: '8px',
        boxShadow: '0 10px 25px rgba(0,0,0,0.3)',
        width: '90%',
        maxWidth: '800px',
        maxHeight: '90vh',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden'
    });
    
    // Create content from templates
    popupContent.innerHTML = `
        <div style="background-color: #eff6ff; border-bottom: 1px solid #dbeafe; padding: 16px; display: flex; justify-content: space-between; align-items: center;">
            <div style="display: flex; align-items: center; gap: 8px;">
                <i class="material-icons">edit</i>
                <h3 style="margin: 0; font-size: 18px; font-weight: 500; color: #1e40af;">Edit Transcript</h3>
            </div>
            <button id="closeEditPopup" style="background: none; border: none; cursor: pointer; color: #2563eb; padding: 4px; border-radius: 50%;">
                <i class="material-icons">close</i>
            </button>
        </div>
        
        <div style="padding: 20px; overflow-y: auto; flex: 1;">
            <!-- Tabs for different editing modes -->
            <div style="border-bottom: 1px solid #e5e7eb; margin-bottom: 16px;">
                <div style="display: flex; margin-bottom: -1px;">
                    <button id="basicEditTab" style="color: #2563eb; border-bottom: 2px solid #2563eb; padding: 8px 16px; font-size: 14px; font-weight: 500; background: none; border: none; border-bottom: 2px solid #2563eb; cursor: pointer;">
                        Basic Edit
                    </button>
                    <button id="timestampEditTab" style="color: #6b7280; padding: 8px 16px; font-size: 14px; font-weight: 500; background: none; border: none; border-bottom: 2px solid transparent; cursor: pointer;">
                        Timestamps
                    </button>
                </div>
            </div>
            
            <!-- Basic Edit Tab -->
            <div id="basicEditContent">
                <label style="display: block; margin-bottom: 8px; font-weight: 500;">Edit Text</label>
                <div id="editableTranscript" contenteditable="true" style="min-height: 100px; padding: 16px; border: 1px solid #d1d5db; border-radius: 8px; margin-bottom: 20px;">${messageBubble.innerHTML}</div>
            </div>
            
            <!-- Timestamp Edit Tab -->
            <div id="timestampEditContent" style="display: none;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                    <label style="font-weight: 500;">Timestamps & Annotations</label>
                    <button id="addTimestampBtn" style="display: flex; align-items: center; gap: 4px; padding: 6px 12px; font-size: 12px; background-color: #eff6ff; color: #2563eb; border: 1px solid #bfdbfe; border-radius: 4px; cursor: pointer;">
                        <i class="material-icons" style="font-size: 14px;">add</i> Add Timestamp
                    </button>
                </div>
                
                <div id="timestampsList" style="display: flex; flex-direction: column; gap: 10px; max-height: 300px; overflow-y: auto; padding-right: 4px;">
                    ${existingTimestamps.length > 0 ? 
                        existingTimestamps.map((ts, index) => `
                            <div class="timestamp-item" style="background-color: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px; padding: 12px; display: grid; grid-template-columns: 1fr auto auto auto; gap: 12px; align-items: center;">
                                <div>
                                    <label style="display: block; font-size: 12px; color: #6b7280; margin-bottom: 4px;">Text</label>
                                    <input type="text" class="timestamp-text" value="${ts.text}" placeholder="Word or phrase" style="width: 100%; padding: 6px 8px; border: 1px solid #d1d5db; border-radius: 4px; font-size: 14px;">
                                </div>
                                
                                <div>
                                    <label style="display: block; font-size: 12px; color: #6b7280; margin-bottom: 4px;">Start</label>
                                    <input type="text" class="timestamp-start" placeholder="0.00" value="${ts.timestamp.split(':')[0]}" style="width: 70px; padding: 6px 8px; border: 1px solid #d1d5db; border-radius: 4px; font-size: 14px;">
                                </div>
                                
                                <div>
                                    <label style="display: block; font-size: 12px; color: #6b7280; margin-bottom: 4px;">End</label>
                                    <input type="text" class="timestamp-end" placeholder="0.00" value="${ts.timestamp.split(':')[1]}" style="width: 70px; padding: 6px 8px; border: 1px solid #d1d5db; border-radius: 4px; font-size: 14px;">
                                </div>
                                
                                <div>
                                    <label style="display: block; font-size: 12px; color: #6b7280; margin-bottom: 4px;">Type</label>
                                    <select class="timestamp-type" style="padding: 6px 8px; border: 1px solid #d1d5db; border-radius: 4px; font-size: 14px; background-color: white;">
                                        <option value="word" ${ts.type === 'word' ? 'selected' : ''}>Word</option>
                                        <option value="filler" ${ts.type === 'filler' ? 'selected' : ''}>Filler</option>
                                        <option value="repetition" ${ts.type === 'repetition' ? 'selected' : ''}>Repetition</option>
                                        <option value="pause" ${ts.type === 'pause' ? 'selected' : ''}>Pause</option>
                                        <option value="mispronunciation" ${ts.type === 'mispronunciation' ? 'selected' : ''}>Mispronunciation</option>
                                        <option value="grammar" ${ts.type === 'grammar' ? 'selected' : ''}>Grammar</option>
                                    </select>
                                </div>
                                
                                <button class="remove-timestamp" style="background: none; border: none; color: #ef4444; cursor: pointer; align-self: end; padding: 6px;">
                                    <i class="material-icons">delete</i>
                                </button>
                            </div>
                        `).join('') : 
                        `<div style="text-align: center; padding: 24px; color: #6b7280;">
                            <i class="material-icons" style="font-size: 32px; margin-bottom: 8px;">timer_off</i>
                            <p style="margin: 0; font-size: 14px;">No timestamps found</p>
                            <p style="margin: 4px 0 0; font-size: 12px;">Click "Add Timestamp" to create one</p>
                        </div>`
                    }
                </div>
            </div>
            
            <!-- Preview section - always visible regardless of tab -->
            <div style="margin-top: 20px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                    <label style="font-weight: 500;">Preview</label>
                    <button id="refreshPreview" style="background: none; border: none; color: #6b7280; cursor: pointer; display: flex; align-items: center; font-size: 12px;">
                        <i class="material-icons" style="font-size: 14px; margin-right: 4px;">refresh</i> Refresh
                    </button>
                </div>
                
                <div id="transcriptPreview" style="background-color: #f8fafc; padding: 16px; border: 1px solid #e2e8f0; border-radius: 8px; color: #334155; min-height: 80px;">
                    ${messageBubble.innerHTML}
                </div>
            </div>
        </div>
        
        <div style="background-color: #f9fafb; border-top: 1px solid #e5e7eb; padding: 16px; display: flex; justify-content: flex-end; gap: 8px;">
            <button id="cancelEditTranscript" style="padding: 8px 16px; background-color: white; border: 1px solid #d1d5db; border-radius: 6px; cursor: pointer;">Cancel</button>
            <button id="saveEditTranscript" style="padding: 8px 16px; background-color: #2563eb; color: white; border: none; border-radius: 6px; cursor: pointer; display: flex; align-items: center; gap: 4px;">
                <i class="material-icons" style="font-size: 16px;">save</i>
                Save Changes
            </button>
        </div>
    `;
    
    // Add to DOM
    popupOverlay.appendChild(popupContent);
    document.body.appendChild(popupOverlay);
    
    console.log('Popup added to DOM');
    
    // Get elements
    const closeBtn = document.getElementById('closeEditPopup');
    const cancelBtn = document.getElementById('cancelEditTranscript');
    const saveBtn = document.getElementById('saveEditTranscript');
    const editableArea = document.getElementById('editableTranscript');
    const previewArea = document.getElementById('transcriptPreview');
    const refreshBtn = document.getElementById('refreshPreview');
    const basicTab = document.getElementById('basicEditTab');
    const timestampTab = document.getElementById('timestampEditTab');
    const basicContent = document.getElementById('basicEditContent');
    const timestampContent = document.getElementById('timestampEditContent');
    const addTimestampBtn = document.getElementById('addTimestampBtn');
    
    // Function to close and cleanup
    function closePopup() {
        popupOverlay.remove();
        console.log('Popup removed from DOM');
    }
    
    // Tab switching
    basicTab.addEventListener('click', function() {
        basicTab.style.color = '#2563eb';
        basicTab.style.borderBottom = '2px solid #2563eb';
        timestampTab.style.color = '#6b7280';
        timestampTab.style.borderBottom = '2px solid transparent';
        
        basicContent.style.display = 'block';
        timestampContent.style.display = 'none';
    });
    
    timestampTab.addEventListener('click', function() {
        timestampTab.style.color = '#2563eb';
        timestampTab.style.borderBottom = '2px solid #2563eb';
        basicTab.style.color = '#6b7280';
        basicTab.style.borderBottom = '2px solid transparent';
        
        timestampContent.style.display = 'block';
        basicContent.style.display = 'none';
    });
    
    // Function to update preview
    function updatePreview() {
        // Get the transcript content
        const content = editableArea.innerHTML;
        
        // Update the preview area
        previewArea.innerHTML = content;
    }
    
    // Function to add a new timestamp
    function addNewTimestamp() {
        const timestampsList = document.getElementById('timestampsList');
        
        // Remove empty state if present
        const emptyState = timestampsList.querySelector('div[style*="text-align: center"]');
        if (emptyState) {
            emptyState.remove();
        }
        
        // Create a timestamp item
        const timestampItem = document.createElement('div');
        timestampItem.className = 'timestamp-item';
        timestampItem.style.backgroundColor = '#f9fafb';
        timestampItem.style.border = '1px solid #e5e7eb';
        timestampItem.style.borderRadius = '6px';
        timestampItem.style.padding = '12px';
        timestampItem.style.display = 'grid';
        timestampItem.style.gridTemplateColumns = '1fr auto auto auto';
        timestampItem.style.gap = '12px';
        timestampItem.style.alignItems = 'center';
        
        timestampItem.innerHTML = `
            <div>
                <label style="display: block; font-size: 12px; color: #6b7280; margin-bottom: 4px;">Text</label>
                <input type="text" class="timestamp-text" placeholder="Word or phrase" style="width: 100%; padding: 6px 8px; border: 1px solid #d1d5db; border-radius: 4px; font-size: 14px;">
            </div>
            
            <div>
                <label style="display: block; font-size: 12px; color: #6b7280; margin-bottom: 4px;">Start</label>
                <input type="text" class="timestamp-start" placeholder="0.00" style="width: 70px; padding: 6px 8px; border: 1px solid #d1d5db; border-radius: 4px; font-size: 14px;">
            </div>
            
            <div>
                <label style="display: block; font-size: 12px; color: #6b7280; margin-bottom: 4px;">End</label>
                <input type="text" class="timestamp-end" placeholder="0.00" style="width: 70px; padding: 6px 8px; border: 1px solid #d1d5db; border-radius: 4px; font-size: 14px;">
            </div>
            
            <div>
                <label style="display: block; font-size: 12px; color: #6b7280; margin-bottom: 4px;">Type</label>
                <select class="timestamp-type" style="padding: 6px 8px; border: 1px solid #d1d5db; border-radius: 4px; font-size: 14px; background-color: white;">
                    <option value="word">Word</option>
                    <option value="filler">Filler</option>
                    <option value="repetition">Repetition</option>
                    <option value="pause">Pause</option>
                    <option value="mispronunciation">Mispronunciation</option>
                    <option value="grammar">Grammar</option>
                </select>
            </div>
            
            <button class="remove-timestamp" style="background: none; border: none; color: #ef4444; cursor: pointer; align-self: end; padding: 6px;">
                <i class="material-icons">delete</i>
            </button>
        `;
        
        // Add to list
        timestampsList.prepend(timestampItem);
        
        // Add event listener to remove button
        const removeBtn = timestampItem.querySelector('.remove-timestamp');
        removeBtn.addEventListener('click', function() {
            timestampItem.remove();
            
            // If no timestamps left, add empty state
            if (timestampsList.children.length === 0) {
                timestampsList.innerHTML = `
                    <div style="text-align: center; padding: 24px; color: #6b7280;">
                        <i class="material-icons" style="font-size: 32px; margin-bottom: 8px;">timer_off</i>
                        <p style="margin: 0; font-size: 14px;">No timestamps found</p>
                        <p style="margin: 4px 0 0; font-size: 12px;">Click "Add Timestamp" to create one</p>
                    </div>
                `;
            }
        });
    }
    
    // Function to collect timestamps from the UI
    function collectTimestamps() {
        const timestamps = [];
        const timestampItems = document.querySelectorAll('.timestamp-item');
        
        timestampItems.forEach(item => {
            const text = item.querySelector('.timestamp-text').value;
            const start = item.querySelector('.timestamp-start').value;
            const end = item.querySelector('.timestamp-end').value;
            const type = item.querySelector('.timestamp-type').value;
            
            if (text && start && end) {
                timestamps.push({
                    text,
                    timestamp: `${start}:${end}`,
                    type
                });
            }
        });
        
        return timestamps;
    }
    
    // Function to save the edited content
    function saveEdit() {
        // Get the edited text
        const editedText = editableArea.innerHTML;
        
        // Get the timestamps
        const timestamps = collectTimestamps();
        
        console.log('Saving edited text and timestamps:', timestamps.length);
        
        // Apply timestamps to the message bubble using the new function
        // This will clear old annotations and only apply the new ones
        applyTimestampsToContent(messageBubble, editedText, timestamps);
        
        // Explicitly reattach all timestamp handlers to ensure proper functionality
        reattachAllTimestampHandlers();
        
        // Update the audio highlighting based on current playback time
        highlightCurrentTranscriptSection();
        
        // Update annotation visibility indicators if any annotations were hidden
        updateAnnotationVisibilityIndicators();
        
        // Show success message
        showToast('Changes saved successfully', 'success');
        
        // Save edit history if that function exists
        if (typeof saveEditHistory === 'function') {
            saveEditHistory(messageBubble.innerHTML);
        }
        
        // Close popup
        closePopup();
    }
    
    // Apply timestamps to content
    function applyTimestampsToContent(bubble, content, timestamps) {
        // Extract plain text from content, removing all HTML
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = content;
        const plainText = tempDiv.textContent;
        
        // Create a new HTML string with timestamps applied
        let html = '';
        let lastIndex = 0;
        
        // Sort timestamps by position in text
        const sortedTimestamps = [...timestamps].sort((a, b) => {
            const aIndex = plainText.toLowerCase().indexOf(a.text.toLowerCase());
            const bIndex = plainText.toLowerCase().indexOf(b.text.toLowerCase());
            return aIndex - bIndex;
        });
        
        // Apply each timestamp
        for (const ts of sortedTimestamps) {
            if (!ts.text.trim()) continue;
            
            // Find position of this text in plain content
            const index = plainText.toLowerCase().indexOf(ts.text.toLowerCase(), lastIndex);
            if (index === -1) continue;
            
            // Add text before this timestamp
            html += plainText.substring(lastIndex, index);
            
            // Get exact text with original casing
            const originalText = plainText.substring(index, index + ts.text.length);
            
            // Create span for this timestamp
            const [start, end] = ts.timestamp.split(':');
            
            if (ts.type && ts.type !== 'word') {
                // Create highlight span
                const uniqueId = Math.floor(Math.random() * 10000);
                let extraAttrs = '';
                
                // Add duration attribute for pauses
                if (ts.type === 'pause') {
                    const duration = (parseFloat(end) - parseFloat(start)).toFixed(3);
                    extraAttrs = ` data-duration="${duration}"`;
                }
                
                html += `<span class="highlight highlight-${ts.type} ${ts.type}${uniqueId}" data-timestamp="${ts.timestamp}" data-type="${ts.type}"${extraAttrs}>${originalText}</span>`;
            } else {
                // Create regular word-timestamp span
                html += `<span class="word-timestamp" data-timestamp="${ts.timestamp}">${originalText}</span>`;
            }
            
            // Update last index to continue after this match
            lastIndex = index + originalText.length;
        }
        
        // Add any remaining text
        html += plainText.substring(lastIndex);
        
        // Update bubble content
        bubble.innerHTML = html;
        
        // After updating the content, attach click handlers to timestamp elements
        const wordTimestamps = bubble.querySelectorAll('.word-timestamp');
        const annotations = bubble.querySelectorAll('.highlight:not(.word-timestamp)');
        
        console.log(`Found ${wordTimestamps.length} word timestamps and ${annotations.length} annotations to attach handlers to`);
        
        // Apply highlighting handlers
        wordTimestamps.forEach(span => {
            span.removeEventListener('click', handleWordTimestampClick);
            span.addEventListener('click', handleWordTimestampClick);
        });
        
        annotations.forEach(span => {
            span.removeEventListener('click', handleHighlightClick);
            span.addEventListener('click', handleHighlightClick);
        });
        
        console.log(`Applied ${timestamps.length} timestamps to edited content`);
    }
    
    // Add event listeners
    closeBtn.addEventListener('click', closePopup);
    cancelBtn.addEventListener('click', closePopup);
    saveBtn.addEventListener('click', saveEdit);
    refreshBtn.addEventListener('click', updatePreview);
    
    // Add event listener for add timestamp button
    if (addTimestampBtn) {
        addTimestampBtn.addEventListener('click', addNewTimestamp);
    }
    
    // Add event listeners to remove timestamp buttons
    document.querySelectorAll('.remove-timestamp').forEach(button => {
        button.addEventListener('click', function() {
            const item = this.closest('.timestamp-item');
            if (item) {
                item.remove();
            }
        });
    });
    
    // Update preview when content changes
    editableArea.addEventListener('input', updatePreview);
    
    // Setup keyboard shortcuts
    document.addEventListener('keydown', function escHandler(e) {
        if (e.key === 'Escape') {
            closePopup();
            document.removeEventListener('keydown', escHandler);
        } else if ((e.ctrlKey || e.metaKey) && e.key === 's') {
            e.preventDefault();
            saveEdit();
        }
    });
    
    // Focus editable area
    setTimeout(() => {
        editableArea.focus();
    }, 100);
}

// Add custom styles for the transcript edit popup
function addEditPopupStyles() {
    // Check if styles already exist
    if (document.getElementById('editPopupStyles')) return;
    
    // Create style element
    const styleEl = document.createElement('style');
    styleEl.id = 'editPopupStyles';
    
    // Define styles
    styleEl.textContent = `
        /* Animation keyframes */
        @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
        }
        
        @keyframes fadeOut {
            from { opacity: 1; }
            to { opacity: 0; }
        }
        
        @keyframes scaleIn {
            from { transform: scale(0.95); opacity: 0; }
            to { transform: scale(1); opacity: 1; }
        }
        
        @keyframes savePulse {
            0% { box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.5); }
            70% { box-shadow: 0 0 0 10px rgba(59, 130, 246, 0); }
            100% { box-shadow: 0 0 0 0 rgba(59, 130, 246, 0); }
        }
        
        /* Animation classes */
        .animate-fade-in {
            animation: fadeIn 0.3s ease-out;
        }
        
        .animate-fade-out {
            animation: fadeOut 0.2s ease-out;
        }
        
        .animate-scale-in {
            animation: scaleIn 0.3s ease-out;
        }
        
        /* Highlight visibility transitions */
        .highlight {
            transition: opacity 0.3s ease-out, background-color 0.2s ease-out;
        }
        
        .highlight-hidden {
            opacity: 0;
            pointer-events: none;
        }
        
        /* Annotation filter button transitions */
        .annotation-filter {
            transition: all 0.2s ease-out;
            position: relative;
            overflow: hidden;
        }
        
        /* Inactive filter (visibility_off) styling */
        .annotation-filter:not(.active-filter) {
            opacity: 0.75;
            background-color: #f3f4f6 !important;
            color: #6b7280 !important;
            border-color: #e5e7eb !important;
        }
        
        .annotation-filter:not(.active-filter):hover {
            opacity: 0.9;
            background-color: #e5e7eb !important;
        }
        
        .annotation-filter:not(.active-filter)::after {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: repeating-linear-gradient(
                -45deg,
                rgba(0, 0, 0, 0.03),
                rgba(0, 0, 0, 0.03) 5px,
                rgba(0, 0, 0, 0) 5px,
                rgba(0, 0, 0, 0) 10px
            );
            pointer-events: none;
        }
        
        /* Active filter styling */
        .annotation-filter.active-filter {
            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
            transform: translateY(-1px);
        }
        
        /* Message controls styling */
        .message-controls {
            display: flex;
            align-items: center;
            gap: 4px;
            transition: opacity 0.2s ease-out;
            background-color: rgba(255, 255, 255, 0.8);
            backdrop-filter: blur(4px);
            padding: 2px 4px;
            border-radius: 6px;
        }
        
        .message-controls.visibility-active {
            opacity: 1 !important;
        }
        
        .message-controls button {
            transition: transform 0.15s ease-out, background-color 0.15s ease-out;
        }
        
        .message-controls button:hover {
            transform: translateY(-1px);
        }
        
        .message-controls button:active {
            transform: translateY(0);
        }
        
        /* Visibility indicator styling */
        .annotation-visibility-indicator {
            opacity: 0.8;
            transition: opacity 0.2s ease-out, background-color 0.2s ease-out;
        }
        
        .annotation-visibility-indicator:hover {
            opacity: 1;
        }
        
        /* Annotation counter styling */
        .annotation-counter {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            cursor: pointer;
            font-size: 13px;
            transition: all 0.2s ease-out;
            box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
            border: 1px solid rgba(0, 0, 0, 0.05);
            opacity: 0.9;
            margin-right: 4px;
            white-space: nowrap;
        }
        
        .annotation-counter:hover {
            opacity: 1;
            transform: translateY(-1px);
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
        }
        
        .annotation-counter:active {
            transform: translateY(0);
            box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
        }
        
        /* Badge color styling */
        .annotation-counter.bg-blue-50 {
            background-color: #eff6ff;
            border-color: #dbeafe;
        }
        
        .annotation-counter.bg-blue-50:hover {
            background-color: #dbeafe;
        }
        
        .annotation-counter.bg-yellow-50 {
            background-color: #fefce8;
            border-color: #fef08a;
        }
        
        .annotation-counter.bg-yellow-50:hover {
            background-color: #fef9c3;
        }
        
        .annotation-counter.bg-gray-100 {
            background-color: #f3f4f6;
            border-color: #e5e7eb;
        }
        
        .annotation-counter.bg-gray-100:hover {
            background-color: #e5e7eb;
        }
        
        /* Tooltip enhancement */
        [title] {
            position: relative;
        }
        
        [title]:hover::after {
            content: attr(title);
            position: absolute;
            bottom: 100%;
            left: 50%;
            transform: translateX(-50%);
            white-space: pre-wrap;
            background: #333;
            color: white;
            padding: 5px 10px;
            border-radius: 4px;
            font-size: 12px;
            font-weight: normal;
            max-width: 300px;
            text-align: left;
            line-height: 1.4;
            z-index: 10;
            opacity: 0;
            pointer-events: none;
            animation: fadeIn 0.3s ease forwards;
        }
        
        [title]:hover::before {
            content: "";
            position: absolute;
            bottom: 98%;
            left: 50%;
            transform: translateX(-50%);
            border: 5px solid transparent;
            border-top-color: #333;
            z-index: 10;
            animation: fadeIn 0.3s ease forwards;
        }
        
        /* Utility classes for the popup */
        .fixed {
            position: fixed;
        }
        
        .inset-0 {
            top: 0;
            right: 0;
            bottom: 0;
            left: 0;
        }
        
        .bg-black\\/40 {
            background-color: rgba(0, 0, 0, 0.4);
        }
        
        .backdrop-blur-sm {
            backdrop-filter: blur(4px);
            -webkit-backdrop-filter: blur(4px);
        }
        
        .z-50 {
            z-index: 50;
        }
        
        .flex {
            display: flex;
        }
        
        .items-center {
            align-items: center;
        }
        
        .justify-center {
            justify-content: center;
        }
        
        .overflow-hidden {
            overflow: hidden;
        }
        
        .bg-white {
            background-color: white;
        }
        
        .rounded-lg {
            border-radius: 0.5rem;
        }
        
        .shadow-lg {
            box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
        }
        
        .w-full {
            width: 100%;
        }
        
        .max-w-3xl {
            max-width: 48rem;
        }
        
        .max-h-\\[90vh\\] {
            max-height: 90vh;
        }
        
        .transform {
            transform: translateX(0) translateY(0) rotate(0) skewX(0) skewY(0) scaleX(1) scaleY(1);
        }
        
        .transition-all {
            transition-property: all;
            transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
            transition-duration: 150ms;
        }
        
        .flex-col {
            flex-direction: column;
        }
        
        /* Custom scrollbar */
        .custom-scrollbar::-webkit-scrollbar {
            width: 8px;
            height: 8px;
        }
        
        .custom-scrollbar::-webkit-scrollbar-track {
            background: #f1f1f1;
            border-radius: 10px;
        }
        
        .custom-scrollbar::-webkit-scrollbar-thumb {
            background: #c1c1c1;
            border-radius: 10px;
        }
        
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
            background: #a1a1a1;
        }
        
        /* Button animation */
        .save-button-pulse {
            animation: savePulse 2s infinite;
        }
        
        /* Highlight styles */
        .highlight {
            display: inline;
            padding: 0 2px;
            border-radius: 3px;
            font-weight: 500;
        }
        
        .highlight-pause {
            background-color: rgba(59, 130, 246, 0.1);
            color: rgb(37, 99, 235);
            border-bottom: 1px dashed rgb(37, 99, 235);
        }
        
        .highlight-filler {
            background-color: rgba(251, 191, 36, 0.1);
            color: rgb(217, 119, 6);
            border-bottom: 1px dashed rgb(217, 119, 6);
        }
        
        .highlight-repetition {
            background-color: rgba(250, 204, 21, 0.1);
            color: rgb(202, 138, 4);
            border-bottom: 1px dashed rgb(202, 138, 4);
        }
        
        .highlight-mispronunciation {
            background-color: rgba(168, 85, 247, 0.1);
            color: rgb(147, 51, 234);
            border-bottom: 1px dashed rgb(147, 51, 234);
        }
        
        .highlight-grammar {
            background-color: rgba(34, 197, 94, 0.1);
            color: rgb(22, 163, 74);
            border-bottom: 1px dashed rgb(22, 163, 74);
        }
        
        /* Style for editable transcript */
        #editableTranscript:focus {
            outline: none;
        }
        
        /* Timestamp item transitions */
        .timestamp-item {
            transition: all 0.2s ease-out;
        }
        
        /* Additional styles for the edit popup */
        #transcriptEditPopup {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        }
        
        #transcriptEditPopup .bg-blue-50 {
            background-color: #eff6ff;
        }
        
        #transcriptEditPopup .text-blue-800 {
            color: #1e40af;
        }
        
        #transcriptEditPopup .border-blue-100 {
            border-color: #dbeafe;
        }
        
        #transcriptEditPopup .text-blue-600 {
            color: #2563eb;
        }
        
        #transcriptEditPopup .hover\\:bg-blue-100:hover {
            background-color: #dbeafe;
        }
        
        #transcriptEditPopup .border-gray-200 {
            border-color: #e5e7eb;
        }
        
        #transcriptEditPopup .border-blue-600 {
            border-color: #2563eb;
        }
        
        #transcriptEditPopup .text-gray-500 {
            color: #6b7280;
        }
        
        #transcriptEditPopup .hover\\:text-gray-700:hover {
            color: #374151;
        }
        
        #transcriptEditPopup .hover\\:border-gray-300:hover {
            border-color: #d1d5db;
        }
        
        #transcriptEditPopup .text-gray-700 {
            color: #374151;
        }
        
        #transcriptEditPopup .bg-gray-50 {
            background-color: #f9fafb;
        }
        
        #transcriptEditPopup .text-red-500 {
            color: #ef4444;
        }
        
        #transcriptEditPopup .hover\\:bg-red-50:hover {
            background-color: #fef2f2;
        }
        
        #transcriptEditPopup .border-red-100 {
            border-color: #fee2e2;
        }
        
        /* For the buttons */
        #transcriptEditPopup .bg-blue-600 {
            background-color: #2563eb;
        }
        
        #transcriptEditPopup .text-white {
            color: white;
        }
        
        #transcriptEditPopup .hover\\:bg-blue-700:hover {
            background-color: #1d4ed8;
        }
    `;
    
    // Append to document head
    document.head.appendChild(styleEl);
} 

// ... rest of the existing code ...

// Function to add a new timestamp entry
function addNewTimestamp() {
    const timestampsList = document.getElementById('timestampsList');
    if (!timestampsList) return;
    
    // Remove empty state if present
    const emptyState = timestampsList.querySelector('.text-center');
    if (emptyState) {
        emptyState.remove();
    }
    
    const newTimestamp = document.createElement('div');
    newTimestamp.className = 'timestamp-item flex flex-col sm:flex-row gap-2 p-3 bg-white rounded-lg shadow-sm hover:shadow-md transition-shadow animate-slide-in';
    
    newTimestamp.innerHTML = `
        <!-- Text input -->
        <div class="flex-1">
            <label class="block text-xs text-gray-500 mb-1">Word/Phrase</label>
            <input type="text" class="timestamp-text w-full text-sm p-2 border border-gray-300 rounded-md" 
                placeholder="Enter word or phrase">
        </div>
        
        <!-- Timestamps -->
        <div class="flex gap-2 items-end">
            <div>
                <label class="block text-xs text-gray-500 mb-1">Start</label>
                <input type="text" class="timestamp-start w-20 text-sm p-2 border border-gray-300 rounded-md" 
                    placeholder="00:00.0">
            </div>
            <div class="pb-2">
                <span class="text-gray-400">to</span>
            </div>
            <div>
                <label class="block text-xs text-gray-500 mb-1">End</label>
                <input type="text" class="timestamp-end w-20 text-sm p-2 border border-gray-300 rounded-md" 
                    placeholder="00:00.0">
            </div>
        </div>
        
        <!-- Type and delete -->
        <div class="flex gap-2 items-end">
            <div>
                <label class="block text-xs text-gray-500 mb-1">Type</label>
                <select class="timestamp-type text-sm p-2 border border-gray-300 rounded-md bg-gray-50">
                    <option value="word">Word</option>
                    <option value="filler">Filler</option>
                    <option value="repetition">Repetition</option>
                    <option value="pause">Pause</option>
                    <option value="mispronunciation">Mispronunciation</option>
                    <option value="grammar">Grammar</option>
                </select>
            </div>
            <button class="remove-timestamp h-10 p-2 text-gray-400 hover:text-red-500 rounded-md hover:bg-red-50 transition-colors border border-transparent hover:border-red-100">
                <i class="material-icons">delete_outline</i>
            </button>
        </div>
    `;
    
    timestampsList.insertBefore(newTimestamp, timestampsList.firstChild);
    
    // Add remove button handler
    newTimestamp.querySelector('.remove-timestamp').addEventListener('click', () => {
        newTimestamp.style.opacity = '0';
        newTimestamp.style.transform = 'translateX(10px)';
        setTimeout(() => {
            newTimestamp.remove();
            updateTranscriptPreview();
            checkEmptyState();
        }, 200);
    });
    
    // Focus the text input
    newTimestamp.querySelector('.timestamp-text').focus();
    
    // Scroll to the new timestamp
    timestampsList.scrollTop = 0;
}

// ... rest of the existing code ...

// Save the transcript edit with timestamps
function saveTranscriptEdit(messageBubble) {
    // Check if we're using the enhanced editing popup
    const editableTranscript = document.getElementById('editableTranscript');
    if (editableTranscript) {
        // Get the edited content
        let editedContent = editableTranscript.innerHTML;
        
        // Get all timestamp items
        const timestampItems = document.querySelectorAll('.timestamp-item');
        
        // Collect timestamps from the UI
        const timestamps = Array.from(timestampItems).map(item => {
            return {
                text: item.querySelector('.timestamp-text').value.trim(),
                timestamp: `${item.querySelector('.timestamp-start').value.trim()}:${item.querySelector('.timestamp-end').value.trim()}`,
                type: item.querySelector('.timestamp-type').value
            };
        }).filter(ts => ts.text && ts.timestamp.includes(':'));
        
        console.log(`Collected ${timestamps.length} timestamps from the editor`);
        
        // Apply timestamps to the message bubble - this will clear old annotations
        applyTimestampsToContent(messageBubble, editedContent, timestamps);
        
        // Explicitly reattach all timestamp handlers
        reattachAllTimestampHandlers();
        
        // Update highlighting if audio is playing
        highlightCurrentTranscriptSection();
        
        // Update annotation visibility indicators if any annotations were hidden
        updateAnnotationVisibilityIndicators();
        
        // Remove message edit mode styling
        messageBubble.classList.remove('message-edit-mode');
        
        // Update saved transcript in local storage if applicable
        const messageContainer = messageBubble.closest('[data-message-id]');
        const messageId = messageContainer ? messageContainer.dataset.messageId : null;
        if (messageId) {
            try {
                const transcriptData = JSON.parse(localStorage.getItem('transcriptData') || '[]');
                const messageIndex = transcriptData.findIndex(msg => msg.id === messageId);
                
                if (messageIndex !== -1) {
                    transcriptData[messageIndex].content = messageBubble.innerHTML;
                    localStorage.setItem('transcriptData', JSON.stringify(transcriptData));
                }
            } catch (error) {
                console.error('Error updating transcript data in localStorage:', error);
            }
        }
        
        // Delete the stored original content reference
        delete messageBubble.originalContent;
        
        // Show success toast
        showToast('Transcript updated successfully', 'success');
        
        return true;
    } 
    // If we're using the simple inline edit mode
    else if (messageBubble.contentEditable === 'true') {
        // Clean up the bubble after editing
        messageBubble.contentEditable = false;
        messageBubble.classList.remove('message-edit-mode');
        
        // Extract timestamps from the edited content
        const timestamps = [];
        const timestampElements = messageBubble.querySelectorAll('[data-timestamp]');
        
        timestampElements.forEach(el => {
            timestamps.push({
                text: el.textContent,
                timestamp: el.getAttribute('data-timestamp'),
                type: el.getAttribute('data-type') || 'word'
            });
        });
        
        console.log(`Extracted ${timestamps.length} timestamps from edited content`);
        
        // Re-apply timestamps to ensure consistent formatting
        if (timestamps.length > 0) {
            // Get the plain text content
            const plainContent = messageBubble.textContent;
            
            // Apply timestamps - this will clear old annotations and apply new ones
            applyTimestampsToContent(messageBubble, plainContent, timestamps);
            
            // Explicitly reattach handlers after editing
            reattachAllTimestampHandlers();
            
            // Update highlighting if audio is playing
            highlightCurrentTranscriptSection();
            
            // Update annotation visibility indicators if any annotations were hidden
            updateAnnotationVisibilityIndicators();
        }
        
        // Update the original content
        messageBubble.originalContent = messageBubble.innerHTML;
        
        // Show success toast
        showToast('Transcript updated successfully', 'success');
        
        return true;
    }
    
    return false;
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

// Function to update the preview
function updateTranscriptPreview() {
    const editableTranscript = document.getElementById('editableTranscript');
    const preview = document.getElementById('transcriptPreview');
    const timestampItems = document.querySelectorAll('.timestamp-item');
    
    if (!editableTranscript || !preview) {
        console.error('Missing editable transcript or preview elements');
        return;
    }
    
    let text = editableTranscript.textContent;
    let html = text;
    
    // Sort timestamps by text length (longer first to avoid replacement conflicts)
    const timestamps = Array.from(timestampItems).map(item => {
        const textInput = item.querySelector('.timestamp-text');
        const startInput = item.querySelector('.timestamp-start');
        const endInput = item.querySelector('.timestamp-end');
        const typeSelect = item.querySelector('.timestamp-type');
        
        if (!textInput || !startInput || !endInput || !typeSelect) {
            console.warn('Incomplete timestamp item found, skipping');
            return null;
        }
        
        return {
            text: textInput.value.trim(),
            start: startInput.value.trim(),
            end: endInput.value.trim(),
            type: typeSelect.value
        };
    }).filter(ts => ts && ts.text && ts.start && ts.end)
    .sort((a, b) => b.text.length - a.text.length);
    
    // Apply highlights
    timestamps.forEach(ts => {
        try {
            const escapedText = ts.text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const regex = new RegExp('\\b' + escapedText + '\\b', 'gi');
            html = html.replace(regex, `<span class="highlight highlight-${ts.type}" 
                data-timestamp="${ts.start}:${ts.end}" 
                data-type="${ts.type}" 
                style="background-color: ${getHighlightColor(ts.type)}">$&</span>`);
        } catch (error) {
            console.error('Error processing highlight:', error, ts);
        }
    });
    
    preview.innerHTML = html || text;
}

// Helper function to get highlight colors
function getHighlightColor(type) {
    const colors = {
        word: 'rgba(59, 130, 246, 0.1)', // blue-400 with opacity
        filler: 'rgba(251, 146, 60, 0.15)', // orange-400 with opacity
        repetition: 'rgba(251, 191, 36, 0.15)', // amber-400 with opacity
        pause: 'rgba(96, 165, 250, 0.15)', // blue-400 with opacity
        mispronunciation: 'rgba(192, 132, 252, 0.15)', // purple-400 with opacity
        grammar: 'rgba(16, 185, 129, 0.15)', // emerald-500 with opacity
        morpheme: 'rgba(129, 140, 248, 0.15)' // indigo-400 with opacity
    };
    return colors[type] || 'rgba(107, 114, 128, 0.1)';
}

// Function to check and update empty state for timestamps
function checkEmptyState() {
    const timestampsList = document.getElementById('timestampsList');
    if (!timestampsList) return;
    
    const items = timestampsList.querySelectorAll('.timestamp-item');
    
    if (items.length === 0) {
        timestampsList.innerHTML = `
            <div class="text-center py-6 text-gray-500">
                <i class="material-icons text-3xl mb-2">timer_off</i>
                <p class="text-sm">No timestamps added yet</p>
                <p class="text-xs mt-1">Click "Add Timestamp" to start adding timestamps</p>
            </div>
        `;
    }
}

// Function to save transcript edits from the popup
function saveTranscriptEdit() {
    const messageId = document.getElementById('transcriptEditPopup').dataset.messageId;
    const editedText = document.getElementById('editableTranscript').innerHTML;
    const timestampsData = collectTimestamps();
    
    // Get current message bubble and update its content
    const messageBubble = document.querySelector(`.message-bubble[data-message-id="${messageId}"]`);
    if (messageBubble) {
        // Find transcript container
        const transcriptContainer = messageBubble.querySelector('.message-content');
        if (transcriptContainer) {
            // Update the transcript content
            transcriptContainer.innerHTML = editedText;
            
            // Store timestamps data as an attribute on the message bubble
            messageBubble.dataset.timestamps = JSON.stringify(timestampsData);
            
            // Mark as edited if not already marked
            if (!messageBubble.classList.contains('edited-message')) {
                messageBubble.classList.add('edited-message');
                const timestamp = messageBubble.querySelector('.message-timestamp');
                if (timestamp) {
                    timestamp.innerHTML += ' <span class="text-xs italic">(edited)</span>';
                }
            }
            
            // Show toast notification
            showToast('Transcript updated successfully', 'success');
            
            // Close the popup
            closeTranscriptEditPopup();
            
            // Save the changes to the server (if implementation exists)
            saveEditToServer(messageId, editedText, timestampsData);
        }
    }
}

// Function to collect timestamps from the editor
function collectTimestamps() {
    const timestamps = [];
    const timestampItems = document.querySelectorAll('.timestamp-item');
    
    timestampItems.forEach(item => {
        const startTime = parseFloat(item.querySelector('[data-start-time]').dataset.startTime);
        const endTime = parseFloat(item.querySelector('[data-end-time]').dataset.endTime);
        const text = item.querySelector('.timestamp-text').textContent.trim();
        
        timestamps.push({
            startTime,
            endTime,
            text
        });
    });
    
    return timestamps;
}

// Function to save edit to server
function saveEditToServer(messageId, editedText, timestampsData) {
    // Prepare data for API
    const data = {
        messageId,
        transcriptText: editedText,
        timestamps: timestampsData
    };
    
    // Example API call - implement actual API call based on your backend
    fetch('/api/update-transcript', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(data)
    })
    .then(response => response.json())
    .then(data => {
        console.log('Success:', data);
    })
    .catch(error => {
        console.error('Error:', error);
        showToast('Changes saved locally but failed to sync with server', 'warning');
    });
}

// Function to close the transcript edit popup
function closeTranscriptEditPopup() {
    const popup = document.getElementById('transcriptEditPopup');
    const overlay = document.getElementById('transcriptEditOverlay');
    
    // Add fade-out animations
    popup.classList.remove('animate-scale-in');
    popup.classList.add('animate-fade-out');
    overlay.classList.remove('animate-fade-in');
    overlay.classList.add('animate-fade-out');
    
    // Remove popup after animation completes
    setTimeout(() => {
        popup.remove();
        overlay.remove();
        
        // Re-enable scrolling on body
        document.body.style.overflow = '';
    }, 200);
}

// Function to apply highlights to text
function applyHighlight(highlightType) {
    const selection = window.getSelection();
    
    if (!selection.rangeCount) return;
    
    const range = selection.getRangeAt(0);
    const selectedContent = range.toString().trim();
    
    if (!selectedContent) return;
    
    // Create highlight span
    const highlightSpan = document.createElement('span');
    highlightSpan.className = `highlight highlight-${highlightType}`;
    highlightSpan.textContent = selectedContent;
    
    // Replace selection with highlighted text
    range.deleteContents();
    range.insertNode(highlightSpan);
    
    // Collapse selection
    selection.removeAllRanges();
    
    // Track change in edit history
    saveEditHistory();
}

// Function to add a timestamp
function addTimestamp() {
    const timestampsList = document.getElementById('timestampsList');
    const newTimestamp = createTimestampItem(0, 0, 'New segment');
    
    timestampsList.appendChild(newTimestamp);
    updateTimestampsDisplay();
}

// Function to create a timestamp item
function createTimestampItem(startTime, endTime, text) {
    const li = document.createElement('li');
    li.className = 'timestamp-item flex flex-col p-2 mb-2 bg-gray-50 rounded border border-gray-200';
    
    li.innerHTML = `
        <div class="flex justify-between items-center mb-2">
            <div class="flex gap-2">
                <input type="text" 
                       data-start-time="${startTime}" 
                       value="${formatTimeInput(startTime)}" 
                       class="w-20 text-sm p-1 border border-gray-300 rounded"
                       onchange="updateTimestampTime(this, 'start')">
                <span class="text-gray-500">to</span>
                <input type="text" 
                       data-end-time="${endTime}" 
                       value="${formatTimeInput(endTime)}" 
                       class="w-20 text-sm p-1 border border-gray-300 rounded"
                       onchange="updateTimestampTime(this, 'end')">
            </div>
            <div class="flex gap-1">
                <button class="p-1 text-gray-500 hover:text-blue-500" onclick="playTimestampSegment(this)">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                </button>
                <button class="p-1 text-gray-500 hover:text-red-500" onclick="removeTimestamp(this)">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                </button>
            </div>
        </div>
        <div>
            <textarea class="timestamp-text w-full p-2 text-sm border border-gray-300 rounded resize-none" 
                      rows="2" 
                      placeholder="Transcript segment text">${text}</textarea>
        </div>
    `;
    
    return li;
}

// Function to format time for input display
function formatTimeInput(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const msecs = Math.floor((seconds % 1) * 1000);
    
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${msecs.toString().padStart(3, '0')}`;
}

// Function to parse time input
function parseTimeInput(timeStr) {
    const parts = timeStr.split(':');
    if (parts.length !== 2) return 0;
    
    const secParts = parts[1].split('.');
    
    const mins = parseInt(parts[0]) || 0;
    const secs = parseInt(secParts[0]) || 0;
    const msecs = parseInt(secParts[1] || 0) || 0;
    
    return mins * 60 + secs + msecs / 1000;
}

// Function to update timestamp time
function updateTimestampTime(input, type) {
    const time = parseTimeInput(input.value);
    input.dataset[`${type}Time`] = time;
    updateTimestampsDisplay();
}

// Function to update timestamps display
function updateTimestampsDisplay() {
    // Here you could implement logic to visually represent timestamps
    // on the transcript, such as highlighting segments, etc.
    console.log('Timestamps updated');
}

// Function to play a timestamp segment
function playTimestampSegment(button) {
    const item = button.closest('.timestamp-item');
    const startTime = parseFloat(item.querySelector('[data-start-time]').dataset.startTime);
    const endTime = parseFloat(item.querySelector('[data-end-time]').dataset.endTime);
    
    // Get the audio element
    const audio = document.querySelector('audio');
    if (audio) {
        audio.currentTime = startTime;
        audio.play();
        
        // Set a timeout to pause at end time
        const duration = endTime - startTime;
        if (duration > 0) {
            setTimeout(() => {
                audio.pause();
            }, duration * 1000);
        }
    }
}

// Function to remove a timestamp
function removeTimestamp(button) {
    const item = button.closest('.timestamp-item');
    item.classList.add('animate-fade-out');
    
    setTimeout(() => {
        item.remove();
        updateTimestampsDisplay();
    }, 200);
}

// Edit history management for undo/redo
let editHistory = [];
let currentHistoryIndex = -1;
const MAX_HISTORY = 20;

// Function to save the current state to history
function saveEditHistory() {
    const content = document.getElementById('editableTranscript').innerHTML;
    
    // Don't save if content is the same as the last history item
    if (editHistory.length > 0 && editHistory[currentHistoryIndex] === content) {
        return;
    }
    
    // If we're not at the end of the history, truncate the history
    if (currentHistoryIndex < editHistory.length - 1) {
        editHistory = editHistory.slice(0, currentHistoryIndex + 1);
    }
    
    // Add the new state
    editHistory.push(content);
    currentHistoryIndex = editHistory.length - 1;
    
    // Limit history size
    if (editHistory.length > MAX_HISTORY) {
        editHistory.shift();
        currentHistoryIndex--;
    }
    
    // Update undo/redo button states
    updateUndoRedoButtons();
}

// Function to undo the last edit
function undoEdit() {
    if (currentHistoryIndex > 0) {
        currentHistoryIndex--;
        document.getElementById('editableTranscript').innerHTML = editHistory[currentHistoryIndex];
        updateUndoRedoButtons();
    }
}

// Function to redo an undone edit
function redoEdit() {
    if (currentHistoryIndex < editHistory.length - 1) {
        currentHistoryIndex++;
        document.getElementById('editableTranscript').innerHTML = editHistory[currentHistoryIndex];
        updateUndoRedoButtons();
    }
}

// Function to update undo/redo button states
function updateUndoRedoButtons() {
    const undoBtn = document.getElementById('undoEditBtn');
    const redoBtn = document.getElementById('redoEditBtn');
    
    if (undoBtn) {
        undoBtn.disabled = currentHistoryIndex <= 0;
        undoBtn.classList.toggle('text-gray-400', currentHistoryIndex <= 0);
        undoBtn.classList.toggle('text-gray-700', currentHistoryIndex > 0);
    }
    
    if (redoBtn) {
        redoBtn.disabled = currentHistoryIndex >= editHistory.length - 1;
        redoBtn.classList.toggle('text-gray-400', currentHistoryIndex >= editHistory.length - 1);
        redoBtn.classList.toggle('text-gray-700', currentHistoryIndex < editHistory.length - 1);
    }
}

// Show a toast notification
function showToast(message, type = 'info') {
    // Remove any existing toasts
    const existingToast = document.getElementById('toast');
    if (existingToast) {
        existingToast.remove();
    }
    
    // Create toast element
    const toast = document.createElement('div');
    toast.id = 'toast';
    toast.className = 'fixed bottom-4 right-4 px-4 py-2 rounded shadow-lg animate-fade-in z-50';
    
    // Set color based on type
    switch (type) {
        case 'success':
            toast.classList.add('bg-green-500', 'text-white');
            break;
        case 'error':
            toast.classList.add('bg-red-500', 'text-white');
            break;
        case 'warning':
            toast.classList.add('bg-yellow-500', 'text-white');
            break;
        default:
            toast.classList.add('bg-blue-500', 'text-white');
    }
    
    toast.textContent = message;
    
    // Add to document
    document.body.appendChild(toast);
    
    // Remove after 3 seconds
    setTimeout(() => {
        toast.classList.remove('animate-fade-in');
        toast.classList.add('animate-fade-out');
        
        setTimeout(() => {
            toast.remove();
        }, 300);
    }, 3000);
}

// Switch between basic and advanced modes
function switchEditMode(mode) {
    const basicTab = document.getElementById('basicTabBtn');
    const advancedTab = document.getElementById('advancedTabBtn');
    const basicContent = document.getElementById('basicEditContent');
    const advancedContent = document.getElementById('advancedEditContent');
    
    if (mode === 'basic') {
        basicTab.classList.add('text-blue-600', 'border-blue-600');
        basicTab.classList.remove('text-gray-500', 'border-transparent');
        advancedTab.classList.add('text-gray-500', 'border-transparent');
        advancedTab.classList.remove('text-blue-600', 'border-blue-600');
        
        basicContent.classList.remove('hidden');
        advancedContent.classList.add('hidden');
    } else {
        advancedTab.classList.add('text-blue-600', 'border-blue-600');
        advancedTab.classList.remove('text-gray-500', 'border-transparent');
        basicTab.classList.add('text-gray-500', 'border-transparent');
        basicTab.classList.remove('text-blue-600', 'border-blue-600');
        
        advancedContent.classList.remove('hidden');
        basicContent.classList.add('hidden');
    }
}

// Function to create and show transcript edit popup
function createTranscriptEditPopup(messageId, initialText, timestampsData = []) {
    // Check if popup already exists and remove it
    const existingPopup = document.getElementById('transcriptEditPopup');
    if (existingPopup) {
        existingPopup.remove();
    }
    
    // Create overlay
    const overlay = document.createElement('div');
    overlay.id = 'transcriptEditOverlay';
    overlay.className = 'fixed inset-0 bg-black bg-opacity-50 z-40 animate-fade-in';
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
            // Ask for confirmation if content has changed
            if (editHistory.length > 1) {
                if (confirm('Discard changes?')) {
                    closeTranscriptEditPopup();
                }
            } else {
                closeTranscriptEditPopup();
            }
        }
    });
    
    // Create popup container
    const popup = document.createElement('div');
    popup.id = 'transcriptEditPopup';
    popup.className = 'fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-[90%] max-w-3xl max-h-[90vh] bg-white rounded-lg shadow-xl z-50 flex flex-col animate-scale-in';
    popup.dataset.messageId = messageId;
    
    // Create header
    const header = document.createElement('div');
    header.className = 'flex justify-between items-center p-4 border-b';
    header.innerHTML = `
        <h2 class="text-lg font-semibold text-gray-800">Edit Transcript</h2>
        <div class="flex space-x-2">
            <button id="undoEditBtn" class="p-1 rounded text-gray-400 disabled:cursor-not-allowed" disabled onclick="undoEdit()">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h10a4 4 0 0 1 0 8H9m-6-8l3-3m0 0l3 3m-3-3v12" />
                </svg>
            </button>
            <button id="redoEditBtn" class="p-1 rounded text-gray-400 disabled:cursor-not-allowed" disabled onclick="redoEdit()">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 10h-4a4 4 0 0 0 0 8h5m6-8l-3-3m0 0l-3 3m3-3v12" />
                </svg>
            </button>
            <button class="p-1 rounded text-gray-700 hover:bg-gray-100" onclick="closeTranscriptEditPopup()">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
            </button>
        </div>
    `;
    
    // Create tabs
    const tabs = document.createElement('div');
    tabs.className = 'flex border-b';
    tabs.innerHTML = `
        <button id="basicTabBtn" class="py-2 px-4 border-b-2 border-blue-600 text-blue-600 font-medium" onclick="switchEditMode('basic')">Basic Edit</button>
        <button id="advancedTabBtn" class="py-2 px-4 border-b-2 border-transparent text-gray-500 font-medium" onclick="switchEditMode('advanced')">Advanced Edit</button>
    `;
    
    // Create content
    const content = document.createElement('div');
    content.className = 'flex-1 overflow-auto p-4';
    
    // Basic edit content
    const basicContent = document.createElement('div');
    basicContent.id = 'basicEditContent';
    basicContent.className = 'h-full flex flex-col';
    
    // Editable transcript area
    const editableArea = document.createElement('div');
    editableArea.id = 'editableTranscript';
    editableArea.className = 'flex-1 p-4 border rounded-lg overflow-auto focus-visible:outline-none';
    editableArea.contentEditable = true;
    editableArea.innerHTML = initialText || '';
    editableArea.addEventListener('input', saveEditHistory);
    
    // Format toolbar
    const toolbar = document.createElement('div');
    toolbar.className = 'flex flex-wrap gap-2 mt-4 p-2 border rounded-lg bg-gray-50';
    toolbar.innerHTML = `
        <button class="px-3 py-1 text-sm rounded bg-gray-200 hover:bg-gray-300" onclick="applyHighlight('pause')">
            Pause
        </button>
        <button class="px-3 py-1 text-sm rounded bg-gray-200 hover:bg-gray-300" onclick="applyHighlight('filler')">
            Filler
        </button>
        <button class="px-3 py-1 text-sm rounded bg-gray-200 hover:bg-gray-300" onclick="applyHighlight('repetition')">
            Repetition
        </button>
        <button class="px-3 py-1 text-sm rounded bg-gray-200 hover:bg-gray-300" onclick="applyHighlight('mispronounce')">
            Mispronunciation
        </button>
        <button class="px-3 py-1 text-sm rounded bg-gray-200 hover:bg-gray-300" onclick="applyHighlight('grammar')">
            Grammar
        </button>
    `;
    
    basicContent.appendChild(editableArea);
    basicContent.appendChild(toolbar);
    
    // Advanced edit content
    const advancedContent = document.createElement('div');
    advancedContent.id = 'advancedEditContent';
    advancedContent.className = 'h-full flex flex-col hidden';
    
    // Timestamps section
    const timestampsSection = document.createElement('div');
    timestampsSection.className = 'flex-1 overflow-auto';
    
    const timestampsHeader = document.createElement('div');
    timestampsHeader.className = 'flex justify-between items-center mb-2';
    timestampsHeader.innerHTML = `
        <h3 class="font-medium text-gray-800">Timestamps</h3>
        <button class="px-2 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600" onclick="addTimestamp()">
            Add Timestamp
        </button>
    `;
    
    const timestampsList = document.createElement('ul');
    timestampsList.id = 'timestampsList';
    timestampsList.className = 'space-y-2';
    
    // Create timestamps from data
    if (timestampsData && timestampsData.length > 0) {
        timestampsData.forEach(timestamp => {
            const item = createTimestampItem(
                timestamp.startTime, 
                timestamp.endTime, 
                timestamp.text
            );
            timestampsList.appendChild(item);
        });
    } else {
        // Add a default empty timestamp
        const item = createTimestampItem(0, 0, '');
        timestampsList.appendChild(item);
    }
    
    timestampsSection.appendChild(timestampsHeader);
    timestampsSection.appendChild(timestampsList);
    
    advancedContent.appendChild(timestampsSection);
    
    // Add content to popup
    content.appendChild(basicContent);
    content.appendChild(advancedContent);
    
    // Create footer
    const footer = document.createElement('div');
    footer.className = 'p-4 border-t flex justify-end space-x-2';
    footer.innerHTML = `
        <button class="px-4 py-2 text-gray-700 border border-gray-300 rounded hover:bg-gray-100" onclick="closeTranscriptEditPopup()">
            Cancel
        </button>
        <button class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 animate-pulse-on-hover" onclick="saveTranscriptEdit()">
            Save Changes
        </button>
    `;
    
    // Assemble popup
    popup.appendChild(header);
    popup.appendChild(tabs);
    popup.appendChild(content);
    popup.appendChild(footer);
    
    // Add to document
    document.body.appendChild(overlay);
    document.body.appendChild(popup);
    
    // Disable scrolling on body
    document.body.style.overflow = 'hidden';
    
    // Initialize edit history
    editHistory = [initialText || ''];
    currentHistoryIndex = 0;
    updateUndoRedoButtons();
    
    // Focus on editable area
    setTimeout(() => {
        editableArea.focus();
    }, 300);
    
    // Add styles if they don't exist yet
    addEditPopupStyles();
}

// Add required styles for edit popup
function addEditPopupStyles() {
    // Check if styles already exist
    if (document.getElementById('transcriptEditStyles')) {
        return;
    }
    
    const styleElement = document.createElement('style');
    styleElement.id = 'transcriptEditStyles';
    styleElement.textContent = `
        @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
        }
        
        @keyframes scaleIn {
            from { transform: translate(-50%, -50%) scale(0.9); opacity: 0; }
            to { transform: translate(-50%, -50%) scale(1); opacity: 1; }
        }
        
        @keyframes fadeOut {
            from { opacity: 1; }
            to { opacity: 0; }
        }
        
        @keyframes scaleOut {
            from { transform: translate(-50%, -50%) scale(1); opacity: 1; }
            to { transform: translate(-50%, -50%) scale(0.9); opacity: 0; }
        }
        
        .animate-fade-in {
            animation: fadeIn 0.3s ease forwards;
        }
        
        .animate-scale-in {
            animation: scaleIn 0.3s ease forwards;
        }
        
        .animate-fade-out {
            animation: fadeOut 0.3s ease forwards;
        }
        
        .animate-scale-out {
            animation: scaleOut 0.3s ease forwards;
        }
        
        .animate-pulse-on-hover:hover {
            animation: pulse 1.5s infinite;
        }
        
        @keyframes pulse {
            0% { box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.5); }
            70% { box-shadow: 0 0 0 5px rgba(59, 130, 246, 0); }
            100% { box-shadow: 0 0 0 0 rgba(59, 130, 246, 0); }
        }
        
        /* Highlight styles for transcript editing */
        .highlight-pause {
            background-color: #ffe6e6;
            border-radius: 2px;
            padding: 0 2px;
        }
        
        .highlight-filler {
            background-color: #e6f7ff;
            border-radius: 2px;
            padding: 0 2px;
        }
        
        .highlight-repetition {
            background-color: #fff2e6;
            border-radius: 2px;
            padding: 0 2px;
        }
        
        .highlight-mispronounce {
            background-color: #e6ffe6;
            border-radius: 2px;
            padding: 0 2px;
        }
        
        .highlight-grammar {
            background-color: #f2e6ff;
            border-radius: 2px;
            padding: 0 2px;
        }
        
        /* Timestamp styles */
        .timestamp-item {
            position: relative;
            padding: 8px;
            border: 1px solid #e5e7eb;
            border-radius: 6px;
            background-color: #f9fafb;
        }
        
        .timestamp-item:hover {
            background-color: #f3f4f6;
        }
        
        .timestamp-controls {
            display: flex;
            align-items: center;
            gap: 6px;
        }
        
        .timestamp-input {
            width: 70px;
            padding: 4px 6px;
            border: 1px solid #d1d5db;
            border-radius: 4px;
            font-size: 0.875rem;
        }
        
        .timestamp-input:focus {
            outline: none;
            border-color: #3b82f6;
            box-shadow: 0 0 0 1px #3b82f6;
        }
        
        .timestamp-text {
            margin-top: 6px;
            padding: 4px 6px;
            border: 1px solid #d1d5db;
            border-radius: 4px;
            width: 100%;
            min-height: 32px;
        }
        
        .timestamp-text:focus {
            outline: none;
            border-color: #3b82f6;
            box-shadow: 0 0 0 1px #3b82f6;
        }
        
        /* Toast notification */
        .toast-notification {
            position: fixed;
            bottom: 20px;
            right: 20px;
            padding: 12px 16px;
            border-radius: 6px;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
            z-index: 100;
            max-width: 300px;
            animation: slideInRight 0.3s, fadeOut 0.3s 2.7s forwards;
        }
        
        .toast-success {
            background-color: #dcf5e8;
            border-left: 4px solid #10b981;
            color: #065f46;
        }
        
        .toast-error {
            background-color: #fee2e2;
            border-left: 4px solid #ef4444;
            color: #b91c1c;
        }
        
        @keyframes slideInRight {
            from { transform: translateX(100%); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
        }
    `;
    
    document.head.appendChild(styleElement);
} 

// Helper function to reattach all timestamp handlers
function reattachAllTimestampHandlers() {
    console.log("Reattaching all timestamp handlers");
    
    // Find all word timestamps in the document
    const wordTimestamps = document.querySelectorAll('.word-timestamp');
    console.log(`Found ${wordTimestamps.length} word timestamps`);
    
    // Remove existing handlers and attach new ones
    wordTimestamps.forEach(span => {
        span.removeEventListener('click', handleWordTimestampClick);
        span.addEventListener('click', handleWordTimestampClick);
    });
    
    // Find all highlight annotations
    const highlightElements = document.querySelectorAll('.message-bubble.patient .highlight:not(.word-timestamp)');
    console.log(`Found ${highlightElements.length} highlight elements`);
    
    // Remove existing handlers and attach new ones
    highlightElements.forEach(highlight => {
        highlight.removeEventListener('click', handleHighlightClick);
        highlight.addEventListener('click', handleHighlightClick);
    });
    
    console.log("All timestamp handlers reattached successfully");
}