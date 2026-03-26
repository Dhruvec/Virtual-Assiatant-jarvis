require('dotenv').config();
const express = require('express');
const cors = require('cors');
const os = require('os');
const nodeDiskInfo = require('node-disk-info');
const { Groq } = require('groq-sdk');

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY || "dummy_key_to_prevent_crash"
});

const app = express();
app.use(cors());
app.use(express.json());

// Helper to calculate CPU load from native OS ticks
function getCpuLoad() {
  const cpus = os.cpus();
  let totalUser = 0;
  let totalSys = 0;
  let totalIdle = 0;

  cpus.forEach(cpu => {
    totalUser += cpu.times.user;
    totalSys += cpu.times.sys;
    totalIdle += cpu.times.idle;
  });

  const totalActive = totalUser + totalSys;
  const totalAll = totalActive + totalIdle;
  return { active: totalActive, all: totalAll, count: cpus.length };
}

let lastCpuStats = getCpuLoad();

app.get('/api/system', async (req, res) => {
  // 1. CPU LOAD
  const currentCpu = getCpuLoad();
  const deltaActive = currentCpu.active - lastCpuStats.active;
  const deltaAll = currentCpu.all - lastCpuStats.all;
  
  let globalUsage = 0;
  if (deltaAll > 0) {
    globalUsage = (deltaActive / deltaAll) * 100;
  }
  
  // Save current for next request
  lastCpuStats = currentCpu;
  
  // Calculate per-core variance based on global usage
  const coreCount = os.cpus().length;
  const coreLoads = Array.from({ length: coreCount }).map(() => {
    let load = globalUsage + (Math.random() * 20 - 10);
    if (load < Math.random() * 5 + 1) load = Math.random() * 5 + 1;
    if (load > 100) load = 100;
    return Math.round(load);
  });

  // 2. MEMORY
  const totalMemMb = Math.floor(os.totalmem() / (1024 * 1024));
  const freeMemMb = Math.floor(os.freemem() / (1024 * 1024));
  const usedMemMb = totalMemMb - freeMemMb;
  const usedPercentage = (usedMemMb / totalMemMb) * 100;

  // 3. STORAGE
  let primaryDisk = null;
  try {
    const disks = await nodeDiskInfo.getDiskInfo();
    primaryDisk = disks.length > 0 ? (disks.find(d => d.mounted === 'C:' || d.mounted === 'C:\\') || disks[0]) : null;
  } catch (e) {
    console.error('Disk read permission failed on host');
  }

  res.json({
    cpu: {
      cores: coreCount,
      loads: coreLoads,
      globalUsage: globalUsage
    },
    memory: {
      totalMemMb,
      usedMemMb,
      freeMemMb,
      usedPercentage
    },
    storage: {
      capacity: primaryDisk ? primaryDisk.blocks : 0,
      used: primaryDisk ? primaryDisk.used : 0,
      available: primaryDisk ? primaryDisk.available : 0,
      mount: primaryDisk ? primaryDisk.mounted : 'Host Drive'
    }
  });
});

app.post('/api/command', (req, res) => {
  const { command } = req.body;
  if (!command) return res.status(400).json({ reply: "No command received." });

  const cmd = command.toLowerCase().trim();
  let reply = "";

  if (cmd.includes("hello") || cmd.includes("hi") || cmd === 'awake') {
    reply = "Greetings, sir. All neural nets are online.";
  } else if (cmd.includes("status")) {
    reply = "Backend servers operational. API connected. Awaiting directives.";
  } else if (cmd.includes("who are you")) {
    reply = "I am J.A.R.V.I.S., your localized AI interface.";
  } else if (cmd.includes("clear") || cmd.includes("clean")) {
    reply = "CLEAR_TRIGGER";
  } else if (cmd.includes("time") || cmd.includes("date")) {
    reply = "It is currently " + new Date().toLocaleString();
  } else if (cmd.includes("restart")) {
    reply = "Initiating soft restart sequence... (Simulated)";
  } else {
    reply = "Command parsed: '" + command + "'. Analyzing optimal approach...";
  }

  setTimeout(() => {
    res.json({ reply });
  }, 400 + Math.random() * 400);
});

app.post('/api/jarvis', async (req, res) => {
  const { message } = req.body;
  if (!message) return res.status(400).json({ reply: "No message received." });

  try {
    const chatCompletion = await groq.chat.completions.create({
      messages: [
        { 
          role: 'system', 
          content: 'You are J.A.R.V.I.S., a highly advanced, sophisticated, and concise AI assistant. Address the user politely, often as "sir" or "madam". Keep your responses extremely concise (1-3 sentences maximum) and highly technical, fitting a sci-fi UI context.' 
        },
        { role: 'user', content: message }
      ],
      model: 'llama-3.3-70b-versatile',
      temperature: 0.7,
      max_tokens: 150,
      top_p: 1,
    });
    
    const reply = chatCompletion.choices[0]?.message?.content || "I am unable to formulate a response at this time, sir.";
    res.json({ reply });
  } catch (error) {
    console.error("Groq API Error:", error.message || error);
    // If authentication fails because they haven't set their key yet
    if (error.status === 401) {
      return res.json({ reply: "Warning: Neural net disconnected. Please provide a valid GROQ_API_KEY in the backend configuration." });
    }
    res.status(500).json({ reply: "Neural net communication failure with Groq." });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`[SYS_LOG] JARVIS Backend Systems Online on port ${PORT}`);
});
