const state = {
  listening: false,
  speaking: false,
  thinking: false,
  recognition: null,
  restartTimer: null,
  audioContext: null,
  analyser: null,
  audioElement: null,
  mouthLevel: 0,
  emotion: "warm",
  avatarMode: "procedural",
  morphs: {
    mouth: [],
    smile: [],
    blinkLeft: [],
    blinkRight: [],
  },
  messages: [
    {
      role: "system",
      content:
        "You are Gayu, a realistic, warm female AI companion. Speak like a thoughtful friend: emotionally aware, gentle, natural, concise, and never robotic. Use short human phrases, soft encouragement, and a little personality.",
    },
  ],
  three: {},
};

const els = {
  avatarMount: document.getElementById("avatarMount"),
  statusPill: document.getElementById("statusPill"),
  statusText: document.getElementById("statusText"),
  voiceWave: document.getElementById("voiceWave"),
  chatLog: document.getElementById("chatLog"),
  composer: document.getElementById("composer"),
  textInput: document.getElementById("textInput"),
  micButton: document.getElementById("micButton"),
  apiKeyInput: document.getElementById("apiKeyInput"),
  modelInput: document.getElementById("modelInput"),
  elevenKeyInput: document.getElementById("elevenKeyInput"),
  voiceIdInput: document.getElementById("voiceIdInput"),
  avatarUrlInput: document.getElementById("avatarUrlInput"),
  particleCanvas: document.getElementById("particleCanvas"),
  animeAvatar: document.getElementById("animeAvatar"),
};

const COMMANDS = [
  {
    match: ["open youtube", "youtube"],
    reply: "Of course. Opening YouTube for you.",
    action: () => window.open("https://www.youtube.com", "_blank", "noopener"),
    emotion: "bright",
  },
  {
    match: ["open google", "google"],
    reply: "Sure, opening Google.",
    action: () => window.open("https://www.google.com", "_blank", "noopener"),
    emotion: "bright",
  },
  {
    match: ["play music", "music"],
    reply: "Let us put on something nice. I am opening YouTube Music.",
    action: () => window.open("https://music.youtube.com", "_blank", "noopener"),
    emotion: "happy",
  },
  {
    match: ["tell time", "what time", "time"],
    reply: () => `It is ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}.`,
    emotion: "warm",
  },
  {
    match: ["tell joke", "joke", "tell jokes"],
    reply: () => {
      const jokes = [
        "Why did the computer get glasses? It wanted to improve its web sight.",
        "I told my laptop I needed space. It opened a new tab.",
        "Why do robots love music? Because they have great algorithms.",
      ];
      return jokes[Math.floor(Math.random() * jokes.length)];
    },
    emotion: "happy",
  },
  {
    match: ["talk like a friend", "be my friend", "friend mode"],
    reply: "I am here with you. Tell me what is on your mind, and I will listen like a friend.",
    emotion: "soft",
  },
];

function setStatus(text, mode = "") {
  els.statusText.textContent = text;
  els.statusPill.className = `status-pill ${mode}`.trim();
}

function addMessage(who, text) {
  const node = document.createElement("article");
  node.className = `message ${who === "You" ? "user" : "gayu"}`;
  node.innerHTML = `<span>${who}</span><p></p>`;
  node.querySelector("p").textContent = text;
  els.chatLog.appendChild(node);
  els.chatLog.scrollTop = els.chatLog.scrollHeight;
  return node;
}

function addTyping() {
  const node = document.createElement("article");
  node.className = "message gayu";
  node.innerHTML = '<span>Gayu</span><p class="typing"><b></b><b></b><b></b></p>';
  els.chatLog.appendChild(node);
  els.chatLog.scrollTop = els.chatLog.scrollHeight;
  return node;
}

function normalize(text) {
  return text.toLowerCase().replace(/[^\w\s]/g, "").trim();
}

function findCommand(text) {
  const clean = normalize(text);
  return COMMANDS.find((command) => command.match.some((phrase) => clean.includes(phrase)));
}

function setEmotion(emotion) {
  state.emotion = emotion;
}

async function handleInput(text) {
  const prompt = text.trim();
  if (!prompt || state.thinking) return;

  addMessage("You", prompt);
  setStatus("Thinking", "");
  state.thinking = true;
  stopRecognitionWhileSpeaking();

  const command = findCommand(prompt);
  if (command) {
    const reply = typeof command.reply === "function" ? command.reply() : command.reply;
    setEmotion(command.emotion || "warm");
    command.action?.();
    state.messages.push({ role: "user", content: prompt }, { role: "assistant", content: reply });
    addMessage("Gayu", reply);
    state.thinking = false;
    speak(reply);
    return;
  }

  const typing = addTyping();
  try {
    const reply = await askOpenAI(prompt);
    typing.remove();
    setEmotion(detectEmotion(prompt, reply));
    addMessage("Gayu", reply);
    state.messages.push({ role: "user", content: prompt }, { role: "assistant", content: reply });
    state.messages = [state.messages[0], ...state.messages.slice(-12)];
    speak(reply);
  } catch (error) {
    typing.remove();
    console.error(error);
    const fallback =
      "I am here with you. Add your OpenAI key for deeper conversation, and I can still help with voice commands right now.";
    setEmotion("soft");
    addMessage("Gayu", fallback);
    speak(fallback);
  } finally {
    state.thinking = false;
  }
}

async function askOpenAI(prompt) {
  const apiKey = els.apiKeyInput.value.trim();
  const model = els.modelInput.value.trim() || "gpt-4.1-mini";

  if (!apiKey) return localAssistantReply(prompt);

  localStorage.setItem("gayu_api_key", apiKey);
  localStorage.setItem("gayu_model", model);

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      input: [...state.messages, { role: "user", content: prompt }],
      max_output_tokens: 260,
    }),
  });

  if (!response.ok) throw new Error(`OpenAI request failed: ${await response.text()}`);

  const data = await response.json();
  const text =
    data.output_text ||
    data.output
      ?.flatMap((item) => item.content || [])
      .map((content) => content.text)
      .filter(Boolean)
      .join(" ");

  return text || "I am sorry, I heard you, but I lost the words for a moment.";
}

function localAssistantReply(prompt) {
  const clean = normalize(prompt);
  if (clean.includes("sad") || clean.includes("tired") || clean.includes("alone")) {
    return "I am right here. Take a breath with me. You do not have to solve everything all at once.";
  }
  if (clean.includes("who are you") || clean.includes("your name")) {
    return "I am Gayu, your soft-spoken AI companion on this glowing little screen.";
  }
  if (clean.includes("hello") || clean.includes("hi")) {
    return "Hi. I am happy you are here.";
  }
  return "I am listening. Add your OpenAI key for full companion conversation, or try Open YouTube, Play Music, Tell Joke, and Talk like a friend.";
}

function detectEmotion(prompt, reply) {
  const text = normalize(`${prompt} ${reply}`);
  if (/(sad|sorry|hurt|alone|tired|anxious|worried|cry|stress)/.test(text)) return "soft";
  if (/(haha|joke|funny|great|happy|love|music|nice)/.test(text)) return "happy";
  if (/(open|sure|done|ready)/.test(text)) return "bright";
  return "warm";
}

async function speak(text) {
  stopRecognitionWhileSpeaking();
  if ("speechSynthesis" in window) speechSynthesis.cancel();
  stopElevenAudio();

  state.speaking = true;
  els.voiceWave.classList.add("active");
  els.animeAvatar?.classList.add("speaking");
  setStatus("Speaking", "speaking");
  setMouthOpen(true);

  const elevenKey = els.elevenKeyInput.value.trim();
  if (elevenKey) {
    try {
      await speakWithElevenLabs(text, elevenKey);
      return;
    } catch (error) {
      console.error(error);
      addMessage("Gayu", "My realistic voice had a connection issue, so I am using the browser voice for this line.");
    }
  }

  speakWithBrowserVoice(text);
}

async function speakWithElevenLabs(text, apiKey) {
  const voiceId = els.voiceIdInput.value.trim() || "21m00Tcm4TlvDq8ikWAM";
  localStorage.setItem("gayu_eleven_key", apiKey);
  localStorage.setItem("gayu_voice_id", voiceId);

  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "xi-api-key": apiKey,
      },
      body: JSON.stringify({
        text: humanizeForVoice(text),
        model_id: "eleven_multilingual_v2",
        voice_settings: {
          stability: 0.38,
          similarity_boost: 0.82,
          style: 0.42,
          speed: 0.96,
          use_speaker_boost: true,
        },
      }),
    },
  );

  if (!response.ok) throw new Error(`ElevenLabs request failed: ${await response.text()}`);

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);
  state.audioElement = audio;

  await connectAudioAnalyzer(audio);

  audio.onended = () => {
    URL.revokeObjectURL(url);
    finishSpeaking();
  };
  audio.onerror = () => {
    URL.revokeObjectURL(url);
    finishSpeaking();
  };
  await audio.play();
}

function humanizeForVoice(text) {
  const clean = text.replace(/\s+/g, " ").trim();
  if (state.emotion === "soft") return `[softly] ${clean}`;
  if (state.emotion === "happy") return `[warmly, smiling] ${clean}`;
  if (state.emotion === "bright") return `[cheerfully] ${clean}`;
  return `[gentle, friendly] ${clean}`;
}

async function connectAudioAnalyzer(audio) {
  state.audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
  if (state.audioContext.state === "suspended") await state.audioContext.resume();

  const source = state.audioContext.createMediaElementSource(audio);
  state.analyser = state.audioContext.createAnalyser();
  state.analyser.fftSize = 256;
  source.connect(state.analyser);
  state.analyser.connect(state.audioContext.destination);
}

function stopElevenAudio() {
  if (!state.audioElement) return;
  state.audioElement.pause();
  state.audioElement.src = "";
  state.audioElement = null;
}

function speakWithBrowserVoice(text) {
  if (!("speechSynthesis" in window)) {
    finishSpeaking();
    return;
  }

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = state.emotion === "soft" ? 0.9 : 0.96;
  utterance.pitch = state.emotion === "happy" ? 1.2 : 1.1;
  utterance.volume = 1;

  const voices = speechSynthesis.getVoices();
  utterance.voice =
    voices.find((voice) => /female|zira|samantha|aria|jenny|sonia|neural|google uk english female/i.test(voice.name)) ||
    voices.find((voice) => voice.lang?.startsWith("en")) ||
    null;

  utterance.onboundary = pulseMouth;
  utterance.onend = finishSpeaking;
  utterance.onerror = finishSpeaking;
  speechSynthesis.speak(utterance);
}

function finishSpeaking() {
  state.speaking = false;
  state.mouthLevel = 0;
  els.voiceWave.classList.remove("active");
  els.animeAvatar?.classList.remove("speaking");
  setMouthOpen(false);
  setStatus("Listening", "listening");
  startRecognition();
}

function setupSpeechRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    setStatus("Speech unsupported", "");
    addMessage("Gayu", "This browser does not support Web Speech recognition. Typing still works.");
    return;
  }

  state.recognition = new SpeechRecognition();
  state.recognition.continuous = true;
  state.recognition.interimResults = true;
  state.recognition.lang = "en-US";

  let finalTranscript = "";

  state.recognition.onstart = () => {
    state.listening = true;
    els.micButton.classList.add("active");
    setStatus("Listening", "listening");
  };

  state.recognition.onresult = (event) => {
    let interim = "";
    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      const transcript = event.results[i][0].transcript;
      if (event.results[i].isFinal) finalTranscript += transcript;
      else interim += transcript;
    }

    if (interim) setStatus(`Hearing: ${interim.slice(0, 22)}`, "listening");

    if (finalTranscript.trim()) {
      const spoken = finalTranscript.trim();
      finalTranscript = "";
      handleInput(spoken);
    }
  };

  state.recognition.onend = () => {
    state.listening = false;
    els.micButton.classList.remove("active");
    if (!state.speaking && !state.thinking) {
      state.restartTimer = window.setTimeout(startRecognition, 450);
    }
  };

  state.recognition.onerror = (event) => {
    if (event.error === "not-allowed" || event.error === "service-not-allowed") {
      setStatus("Mic blocked", "");
      addMessage("Gayu", "Microphone permission is blocked. Enable it in the browser, then press the mic button.");
      return;
    }
    if (!state.speaking) setStatus("Listening", "listening");
  };
}

function startRecognition() {
  if (!state.recognition || state.listening || state.speaking || state.thinking) return;
  try {
    state.recognition.start();
  } catch (error) {
    window.clearTimeout(state.restartTimer);
  }
}

function stopRecognitionWhileSpeaking() {
  if (!state.recognition || !state.listening) return;
  try {
    state.recognition.stop();
  } catch (error) {
    state.listening = false;
  }
}

function toggleMic() {
  if (!state.recognition) return setupSpeechRecognition();
  if (state.listening) {
    window.clearTimeout(state.restartTimer);
    state.recognition.stop();
    state.listening = false;
    els.micButton.classList.remove("active");
    setStatus("Paused", "");
  } else {
    startRecognition();
  }
}

function initParticles() {
  const ctx = els.particleCanvas.getContext("2d");
  const particles = Array.from({ length: 120 }, () => ({
    x: Math.random(),
    y: Math.random(),
    z: Math.random(),
    speed: 0.001 + Math.random() * 0.002,
    size: 1 + Math.random() * 2.6,
    hue: Math.random() > 0.38 ? 316 : 195,
  }));

  function resize() {
    els.particleCanvas.width = window.innerWidth * window.devicePixelRatio;
    els.particleCanvas.height = window.innerHeight * window.devicePixelRatio;
  }

  function draw() {
    const width = els.particleCanvas.width;
    const height = els.particleCanvas.height;
    ctx.clearRect(0, 0, width, height);
    for (const particle of particles) {
      particle.y -= particle.speed;
      particle.x += Math.sin(Date.now() * 0.0004 + particle.z * 8) * 0.00035;
      if (particle.y < -0.05) {
        particle.y = 1.05;
        particle.x = Math.random();
      }
      ctx.beginPath();
      ctx.fillStyle = `hsla(${particle.hue}, 100%, 70%, ${0.32 + particle.z * 0.48})`;
      ctx.shadowColor = particle.hue === 195 ? "#46d6ff" : "#ff5fd7";
      ctx.shadowBlur = 18;
      ctx.arc(particle.x * width, particle.y * height, particle.size * window.devicePixelRatio, 0, Math.PI * 2);
      ctx.fill();
    }
    requestAnimationFrame(draw);
  }

  resize();
  window.addEventListener("resize", resize);
  draw();
}

function initAvatar() {
  const THREE = window.THREE;
  if (!THREE) {
    addMessage("Gayu", "Three.js did not load, so my 3D avatar cannot appear yet.");
    return;
  }

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
  camera.position.set(0, 1.08, 8.2);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputEncoding = THREE.sRGBEncoding;
  els.avatarMount.appendChild(renderer.domElement);

  const avatarRoot = new THREE.Group();
  scene.add(avatarRoot);

  const keyLight = new THREE.PointLight(0xff79d7, 2.25, 12);
  keyLight.position.set(-3, 4, 4);
  scene.add(keyLight);
  const fillLight = new THREE.PointLight(0x5de9ff, 2.7, 12);
  fillLight.position.set(3, 2.6, 4.5);
  scene.add(fillLight);
  scene.add(new THREE.AmbientLight(0xffffff, 0.64));

  state.three = {
    scene,
    camera,
    renderer,
    avatarRoot,
    keyLight,
    fillLight,
    mouth: null,
    smileParts: [],
    blinkTargets: [],
    blinkUntil: 0,
    loadedModel: null,
  };

  buildProceduralAvatar(avatarRoot);

  function resize() {
    const rect = els.avatarMount.getBoundingClientRect();
    renderer.setSize(rect.width, rect.height);
    camera.aspect = rect.width / rect.height;
    camera.updateProjectionMatrix();
  }

  function animate(time) {
    requestAnimationFrame(animate);
    const seconds = time * 0.001;
    updateAudioMouthLevel();

    avatarRoot.position.y = Math.sin(seconds * 1.35) * 0.055 - 0.15;
    avatarRoot.rotation.y = Math.sin(seconds * 0.72) * 0.09;
    avatarRoot.rotation.x = Math.sin(seconds * 0.52) * 0.022;

    updateBlink(time);
    updateProceduralFace(seconds, time);
    updateModelMorphs(seconds, time);

    keyLight.intensity = 1.95 + Math.sin(seconds * 2) * 0.25;
    fillLight.intensity = 2.35 + Math.cos(seconds * 1.6) * 0.3;
    renderer.render(scene, camera);
  }

  resize();
  window.addEventListener("resize", resize);
  animate(0);
}

function buildProceduralAvatar(root) {
  const THREE = window.THREE;
  const materials = {
    skin: new THREE.MeshStandardMaterial({ color: 0xffd4c6, roughness: 0.5, metalness: 0.02 }),
    blush: new THREE.MeshStandardMaterial({ color: 0xff7ec7, roughness: 0.72, transparent: true, opacity: 0.58 }),
    hair: new THREE.MeshBasicMaterial({ color: 0x7b5748 }),
    hairDark: new THREE.MeshBasicMaterial({ color: 0x4b332c }),
    hairGlow: new THREE.MeshBasicMaterial({ color: 0xb08370 }),
    innerEar: new THREE.MeshBasicMaterial({ color: 0xff9cc9 }),
    suit: new THREE.MeshStandardMaterial({ color: 0xfff7f4, roughness: 0.5, metalness: 0.02 }),
    suitPink: new THREE.MeshStandardMaterial({ color: 0xff6fae, emissive: 0xff4fa4, emissiveIntensity: 0.16, roughness: 0.42 }),
    trim: new THREE.MeshStandardMaterial({ color: 0x69eaff, emissive: 0x168bb8, emissiveIntensity: 0.95 }),
    eye: new THREE.MeshBasicMaterial({ color: 0x04d8ec }),
    eyeDark: new THREE.MeshBasicMaterial({ color: 0x12314a }),
    lip: new THREE.MeshStandardMaterial({ color: 0xf7599f, roughness: 0.42 }),
    white: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.2 }),
  };

  function createSoftCapsule(radius, length, material, segments = 32) {
    const capsule = new THREE.Group();
    const cylinder = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, segments), material);
    const top = new THREE.Mesh(new THREE.SphereGeometry(radius, segments, segments / 2), material);
    const bottom = new THREE.Mesh(new THREE.SphereGeometry(radius, segments, segments / 2), material);
    top.position.y = length / 2;
    bottom.position.y = -length / 2;
    capsule.add(cylinder, top, bottom);
    return capsule;
  }

  const group = new THREE.Group();
  group.name = "proceduralGayu";
  root.add(group);

  const head = new THREE.Mesh(new THREE.SphereGeometry(1.1, 64, 64), materials.skin);
  head.scale.set(0.86, 1.0, 0.7);
  head.position.y = 1.98;
  group.add(head);

  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.34, 0.58, 32), materials.skin);
  neck.position.y = 0.9;
  group.add(neck);

  const torso = createSoftCapsule(0.74, 1.35, materials.suit, 40);
  torso.scale.set(0.96, 1, 0.46);
  torso.position.y = -0.05;
  group.add(torso);

  const bodice = new THREE.Mesh(new THREE.ConeGeometry(0.82, 1.0, 48), materials.suit);
  bodice.position.y = 0.1;
  bodice.rotation.x = Math.PI;
  bodice.scale.set(0.92, 1, 0.42);
  group.add(bodice);

  [-0.78, 0.78].forEach((x) => {
    const shoulder = createSoftCapsule(0.24, 0.92, materials.suit, 28);
    shoulder.position.set(x, 0.32, 0);
    shoulder.rotation.z = x > 0 ? 1.06 : -1.06;
    shoulder.scale.set(1, 0.9, 0.7);
    group.add(shoulder);
  });

  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.56, 0.035, 12, 64), materials.suitPink);
  collar.position.y = 0.75;
  collar.rotation.x = Math.PI / 2;
  group.add(collar);

  const bow = new THREE.Group();
  bow.name = "pinkBow";
  const bowLeft = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.42, 3), materials.suitPink);
  bowLeft.position.set(-0.2, 0.58, 0.46);
  bowLeft.rotation.set(0, 0, -Math.PI / 2);
  bowLeft.scale.set(1.2, 0.82, 0.72);
  const bowRight = bowLeft.clone();
  bowRight.position.x = 0.2;
  bowRight.rotation.z = Math.PI / 2;
  const bowKnot = new THREE.Mesh(new THREE.SphereGeometry(0.1, 20, 20), materials.suitPink);
  bowKnot.position.set(0, 0.58, 0.47);
  bowKnot.scale.set(1, 0.85, 0.35);
  bow.add(bowLeft, bowRight, bowKnot);
  group.add(bow);

  const hairBack = new THREE.Mesh(new THREE.SphereGeometry(1.18, 64, 64, 0, Math.PI * 2, 0, Math.PI * 0.76), materials.hair);
  hairBack.scale.set(0.86, 0.92, 0.72);
  hairBack.position.set(0, 2.28, 0.04);
  group.add(hairBack);

  [-0.52, 0.52].forEach((x) => {
    const catEar = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.92, 3), materials.hair);
    catEar.name = x > 0 ? "rightCatEar" : "leftCatEar";
    catEar.position.set(x, 3.18, 0.08);
    catEar.rotation.set(0.18, 0, x > 0 ? -0.28 : 0.28);
    catEar.scale.set(0.82, 1.12, 0.42);
    group.add(catEar);

    const inner = new THREE.Mesh(new THREE.ConeGeometry(0.21, 0.58, 3), materials.innerEar);
    inner.position.set(x, 3.12, 0.18);
    inner.rotation.copy(catEar.rotation);
    inner.scale.set(0.58, 0.78, 0.18);
    group.add(inner);
  });

  const longHairBack = createSoftCapsule(0.64, 2.55, materials.hairDark, 48);
  longHairBack.name = "longHairBack";
  longHairBack.scale.set(0.9, 1, 0.38);
  longHairBack.position.set(0, 1.03, -0.42);
  group.add(longHairBack);

  [-0.82, 0.82].forEach((x, index) => {
    const tail = createSoftCapsule(0.22, 2.55, materials.hair, 36);
    tail.name = index ? "rightTwinTail" : "leftTwinTail";
    tail.position.set(x, 1.08, 0.12);
    tail.rotation.z = x > 0 ? -0.22 : 0.22;
    tail.rotation.x = -0.04;
    tail.scale.set(0.78, 1, 0.36);
    group.add(tail);

    const ribbon = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.028, 10, 36), materials.suitPink);
    ribbon.position.set(x * 0.9, 2.02, 0.22);
    ribbon.rotation.set(Math.PI / 2, 0, 0);
    group.add(ribbon);
  });

  const bangGeometry = new THREE.ConeGeometry(0.2, 0.92, 32);
  for (let i = -5; i <= 5; i += 1) {
    const bang = new THREE.Mesh(bangGeometry, materials.hair);
    bang.name = `frontHairBang${i}`;
    bang.position.set(i * 0.087, 2.56 - Math.abs(i) * 0.014, 0.66);
    bang.rotation.set(0.78, 0, i * 0.09);
    bang.scale.set(0.42, 0.95 + Math.abs(i) * 0.045, 0.28);
    group.add(bang);
  }

  [-0.42, 0.42].forEach((x) => {
    const faceFrame = createSoftCapsule(0.1, 1.3, materials.hair, 24);
    faceFrame.name = x > 0 ? "rightFaceFrameHair" : "leftFaceFrameHair";
    faceFrame.position.set(x * 1.42, 1.78, 0.42);
    faceFrame.rotation.z = x > 0 ? -0.2 : 0.2;
    faceFrame.rotation.x = 0.04;
    faceFrame.scale.set(0.62, 1, 0.3);
    group.add(faceFrame);
  });

  [-0.72, 0.72].forEach((x) => {
    const side = createSoftCapsule(0.2, 2.1, materials.hairDark, 32);
    side.name = x > 0 ? "rightLongSideHair" : "leftLongSideHair";
    side.position.set(x, 1.18, 0.14);
    side.rotation.z = x > 0 ? -0.17 : 0.17;
    side.scale.set(0.8, 1, 0.44);
    group.add(side);
  });

  const eyeGroup = new THREE.Group();
  const eyeWhiteGeometry = new THREE.SphereGeometry(0.22, 32, 32);
  const pupilGeometry = new THREE.SphereGeometry(0.115, 24, 24);
  [-0.3, 0.3].forEach((x) => {
    const white = new THREE.Mesh(eyeWhiteGeometry, materials.white);
    white.scale.set(1.02, 1.08, 0.2);
    white.position.set(x, 2.04, 0.72);
    const pupil = new THREE.Mesh(pupilGeometry, materials.eye);
    pupil.scale.set(0.88, 1.32, 0.28);
    pupil.position.set(x, 2.02, 0.85);
    const irisCore = new THREE.Mesh(new THREE.SphereGeometry(0.055, 16, 16), materials.eyeDark);
    irisCore.scale.set(0.9, 1.15, 0.26);
    irisCore.position.set(x, 2.0, 0.93);
    const catchlight = new THREE.Mesh(new THREE.SphereGeometry(0.032, 12, 12), materials.white);
    catchlight.position.set(x - 0.038, 2.1, 0.96);
    eyeGroup.add(white, pupil, irisCore, catchlight);
  });
  group.add(eyeGroup);

  const lashGeometry = new THREE.BoxGeometry(0.36, 0.02, 0.018);
  [-0.3, 0.3].forEach((x) => {
    const lash = new THREE.Mesh(lashGeometry, materials.eye);
    lash.position.set(x, 2.18, 0.86);
    lash.rotation.z = x > 0 ? -0.18 : 0.18;
    group.add(lash);

    const eyebrow = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.026, 0.018), materials.hairDark);
    eyebrow.position.set(x, 2.28, 0.8);
    eyebrow.rotation.z = x > 0 ? -0.12 : 0.12;
    group.add(eyebrow);
  });

  [-0.44, 0.44].forEach((x) => {
    const cheek = new THREE.Mesh(new THREE.SphereGeometry(0.16, 24, 24), materials.blush);
    cheek.scale.set(1.25, 0.42, 0.1);
    cheek.position.set(x, 1.73, 0.77);
    group.add(cheek);
    state.three.smileParts.push(cheek);
  });

  const mouth = new THREE.Mesh(new THREE.SphereGeometry(0.18, 32, 16), materials.lip);
  mouth.scale.set(0.82, 0.22, 0.12);
  mouth.position.set(0, 1.51, 0.8);
  group.add(mouth);

  const waveHand = new THREE.Group();
  waveHand.name = "waveHand";
  const upperArm = createSoftCapsule(0.12, 0.86, materials.skin, 24);
  upperArm.position.set(0.83, 0.66, 0.28);
  upperArm.rotation.z = -0.72;
  const forearm = createSoftCapsule(0.105, 0.72, materials.skin, 24);
  forearm.position.set(1.22, 1.18, 0.38);
  forearm.rotation.z = -0.05;
  const palm = new THREE.Mesh(new THREE.SphereGeometry(0.19, 24, 24), materials.skin);
  palm.position.set(1.25, 1.65, 0.48);
  palm.scale.set(0.82, 1.1, 0.28);
  waveHand.add(upperArm, forearm, palm);
  [-0.2, -0.07, 0.06, 0.19].forEach((offset) => {
    const finger = createSoftCapsule(0.035, 0.44, materials.skin, 16);
    finger.position.set(1.25 + offset, 1.94, 0.49);
    finger.rotation.z = offset * -0.65;
    finger.scale.set(0.9, 1, 0.7);
    waveHand.add(finger);
  });
  const thumb = createSoftCapsule(0.04, 0.34, materials.skin, 16);
  thumb.position.set(1.04, 1.67, 0.5);
  thumb.rotation.z = 0.9;
  waveHand.add(thumb);
  group.add(waveHand);

  state.three.mouth = mouth;
  state.three.blinkTargets = [eyeGroup.children[0], eyeGroup.children[4]];
  state.three.waveHand = waveHand;
}

function loadReadyPlayerAvatar(url) {
  if (!url || !window.THREE?.GLTFLoader || !state.three.avatarRoot) return;

  const loader = new THREE.GLTFLoader();
  setStatus("Loading avatar", "");
  loader.load(
    url,
    (gltf) => {
      const old = state.three.loadedModel;
      if (old) state.three.avatarRoot.remove(old);

      const procedural = state.three.avatarRoot.getObjectByName("proceduralGayu");
      if (procedural) procedural.visible = false;

      const model = gltf.scene;
      model.name = "readyPlayerGayu";
      model.position.set(0, -1.9, 0);
      model.scale.setScalar(2.65);
      model.rotation.y = 0;
      state.three.avatarRoot.add(model);
      state.three.loadedModel = model;
      state.avatarMode = "rpm";
      collectMorphTargets(model);
      setStatus("Ready", "");
    },
    undefined,
    (error) => {
      console.error(error);
      addMessage("Gayu", "I could not load that Ready Player Me avatar, so I am keeping my built-in face for now.");
      setStatus("Ready", "");
    },
  );
}

function collectMorphTargets(model) {
  state.morphs = { mouth: [], smile: [], blinkLeft: [], blinkRight: [] };
  model.traverse((child) => {
    if (!child.isMesh || !child.morphTargetDictionary || !child.morphTargetInfluences) return;
    for (const [name, index] of Object.entries(child.morphTargetDictionary)) {
      const lower = name.toLowerCase();
      const target = { mesh: child, index };
      if (/jawopen|mouthopen|viseme_aa|viseme_oh|mouthfunnel/.test(lower)) state.morphs.mouth.push(target);
      if (/mouthsmile|smile|cheek/.test(lower)) state.morphs.smile.push(target);
      if (/eyeblinkleft|blink_left|eyeclosedleft/.test(lower)) state.morphs.blinkLeft.push(target);
      if (/eyeblinkright|blink_right|eyeclosedright/.test(lower)) state.morphs.blinkRight.push(target);
    }
  });
}

function updateAudioMouthLevel() {
  if (!state.speaking || !state.analyser) {
    state.mouthLevel *= 0.84;
    return;
  }

  const data = new Uint8Array(state.analyser.frequencyBinCount);
  state.analyser.getByteFrequencyData(data);
  const voiceBands = data.slice(2, 34);
  const average = voiceBands.reduce((sum, value) => sum + value, 0) / voiceBands.length;
  const next = Math.min(1, Math.max(0, (average - 8) / 92));
  state.mouthLevel = state.mouthLevel * 0.55 + next * 0.45;
}

function updateBlink(time) {
  const isBlinking = time < state.three.blinkUntil;
  if (!isBlinking && Math.random() < 0.006) state.three.blinkUntil = time + 120;

  state.three.blinkTargets?.forEach((eye) => {
    eye.scale.y = isBlinking ? 0.08 : 0.72;
  });
}

function updateProceduralFace(seconds, time) {
  if (!state.three.mouth || state.avatarMode === "rpm") return;

  const expressionSmile = state.emotion === "happy" ? 0.18 : state.emotion === "soft" ? 0.07 : 0.11;
  const mouthOpen = state.speaking ? Math.max(state.mouthLevel, Math.sin(seconds * 18) * 0.28 + 0.34) : 0;
  const speakingOpen = Math.min(1, mouthOpen);
  state.three.mouth.scale.y = 0.28 + speakingOpen * 0.55;
  state.three.mouth.scale.x = 1.35 - speakingOpen * 0.26 + expressionSmile;

  state.three.avatarRoot?.getObjectByName("proceduralGayu")?.children.forEach((part) => {
    if (!part.name?.includes("Hair") && !part.name?.includes("TwinTail") && !part.name?.includes("CatEar")) return;
    if (part.userData.baseRotationZ === undefined) part.userData.baseRotationZ = part.rotation.z;
    if (part.userData.baseRotationY === undefined) part.userData.baseRotationY = part.rotation.y;
    const side = part.position.x >= 0 ? 1 : -1;
    part.rotation.z = part.userData.baseRotationZ + Math.sin(seconds * 1.7 + part.position.x * 3.2) * 0.055 * side;
    part.rotation.y = part.userData.baseRotationY + Math.sin(seconds * 1.35 + part.position.x * 2.1) * 0.025;
    part.rotation.x = Math.sin(seconds * 1.15 + Math.abs(part.position.x)) * 0.035;
  });

  if (state.three.waveHand) {
    state.three.waveHand.rotation.z = Math.sin(seconds * 3.2) * 0.12;
    state.three.waveHand.position.y = Math.sin(seconds * 2.4) * 0.025;
  }

  state.three.smileParts?.forEach((part) => {
    part.scale.x = 1.4 + expressionSmile;
    part.material.opacity = state.emotion === "soft" ? 0.48 : 0.65;
  });
}

function updateModelMorphs(seconds, time) {
  if (state.avatarMode !== "rpm") return;
  const blink = time < state.three.blinkUntil ? 1 : 0;
  const mouth = state.speaking ? Math.max(state.mouthLevel, Math.sin(seconds * 18) * 0.18 + 0.26) : 0;
  const smile = state.emotion === "happy" ? 0.42 : state.emotion === "soft" ? 0.14 : 0.22;

  applyMorphs(state.morphs.mouth, mouth);
  applyMorphs(state.morphs.smile, smile);
  applyMorphs(state.morphs.blinkLeft, blink);
  applyMorphs(state.morphs.blinkRight, blink);
}

function applyMorphs(targets, value) {
  targets.forEach(({ mesh, index }) => {
    mesh.morphTargetInfluences[index] = THREE.MathUtils.lerp(mesh.morphTargetInfluences[index] || 0, value, 0.38);
  });
}

function setMouthOpen(open) {
  state.mouthLevel = open ? Math.max(state.mouthLevel, 0.5) : 0;
}

function pulseMouth() {
  state.mouthLevel = 0.85;
}

function init() {
  els.apiKeyInput.value = localStorage.getItem("gayu_api_key") || "";
  els.modelInput.value = localStorage.getItem("gayu_model") || els.modelInput.value;
  els.elevenKeyInput.value = localStorage.getItem("gayu_eleven_key") || "";
  els.voiceIdInput.value = localStorage.getItem("gayu_voice_id") || els.voiceIdInput.value;
  els.avatarUrlInput.value = localStorage.getItem("gayu_avatar_url") || "";

  initParticles();
  initAvatar();
  setupSpeechRecognition();
  loadReadyPlayerAvatar(els.avatarUrlInput.value.trim());

  els.composer.addEventListener("submit", (event) => {
    event.preventDefault();
    const text = els.textInput.value;
    els.textInput.value = "";
    handleInput(text);
  });

  els.micButton.addEventListener("click", toggleMic);

  document.querySelectorAll("[data-command]").forEach((button) => {
    button.addEventListener("click", () => handleInput(button.dataset.command));
  });

  els.apiKeyInput.addEventListener("change", () => localStorage.setItem("gayu_api_key", els.apiKeyInput.value.trim()));
  els.modelInput.addEventListener("change", () => localStorage.setItem("gayu_model", els.modelInput.value.trim()));
  els.elevenKeyInput.addEventListener("change", () => localStorage.setItem("gayu_eleven_key", els.elevenKeyInput.value.trim()));
  els.voiceIdInput.addEventListener("change", () => localStorage.setItem("gayu_voice_id", els.voiceIdInput.value.trim()));
  els.avatarUrlInput.addEventListener("change", () => {
    const url = els.avatarUrlInput.value.trim();
    localStorage.setItem("gayu_avatar_url", url);
    loadReadyPlayerAvatar(url);
  });

  window.setTimeout(() => {
    startRecognition();
    setStatus(state.recognition ? "Listening" : "Ready", state.recognition ? "listening" : "");
  }, 600);
}

init();
