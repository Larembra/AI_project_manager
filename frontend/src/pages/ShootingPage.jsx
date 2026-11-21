import { useState, useEffect, useRef, useCallback } from 'react';

const BIRD_TYPES = [
  {
    type: 'pigeon',
    name: 'Голубь',
    points: 50,
    speedMin: 2.2,
    speedMax: 3.8,
    width: 68,
    height: 48,
    color: '#d0d0dc',
    accentColor: '#9e9eb0',
    wingColor: '#b0b0c4',
    beakColor: '#ff9800',
    rarity: 0.45,
  },
  {
    type: 'raven',
    name: 'Ворон Soprano',
    points: 100,
    speedMin: 3.5,
    speedMax: 5.2,
    width: 58,
    height: 42,
    color: '#1a1a24',
    accentColor: '#d32f2f',
    wingColor: '#2b2b3a',
    beakColor: '#d32f2f',
    rarity: 0.35,
  },
  {
    type: 'falcon',
    name: 'Золотой сокол',
    points: 250,
    speedMin: 5.5,
    speedMax: 8.0,
    width: 44,
    height: 32,
    color: '#f59e0b',
    accentColor: '#fbbf24',
    wingColor: '#d97706',
    beakColor: '#ffffff',
    rarity: 0.15,
  },
  {
    type: 'drone',
    name: 'Дрон-шпион',
    points: 500,
    speedMin: 6.5,
    speedMax: 9.5,
    width: 50,
    height: 28,
    color: '#ef4444',
    accentColor: '#ffffff',
    wingColor: '#991b1b',
    beakColor: '#ef4444',
    rarity: 0.05,
    isDrone: true,
  },
];

const MAX_AMMO = 6;
const ROUND_TIME = 60; // 60 seconds for timed mode

export default function ShootingPage() {
  const [gameActive, setGameActive] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [mode, setMode] = useState('timed'); // 'timed' | 'endless'
  const [timeLeft, setTimeLeft] = useState(ROUND_TIME);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [maxStreak, setMaxStreak] = useState(0);
  const [shots, setShots] = useState(0);
  const [hits, setHits] = useState(0);
  const [ammo, setAmmo] = useState(MAX_AMMO);
  const [reloading, setReloading] = useState(false);
  const [muted, setMuted] = useState(false);
  const [recoil, setRecoil] = useState(false);
  const [isInsideArea, setIsInsideArea] = useState(false);

  // High score in local storage
  const [highScore, setHighScore] = useState(() => {
    const saved = localStorage.getItem('soprano_shooting_highscore');
    return saved ? parseInt(saved, 10) : 0;
  });

  // Game entities
  const [birds, setBirds] = useState([]);
  const [popups, setPopups] = useState([]);
  const [particles, setParticles] = useState([]);

  const playAreaRef = useRef(null);
  const crosshairRef = useRef(null);
  const animFrameRef = useRef(null);
  const lastSpawnRef = useRef(0);
  const audioCtxRef = useRef(null);

  // Synchronous game refs to guarantee immediate updates and zero stale state
  const birdsRef = useRef([]);
  const scoreRef = useRef(0);
  const streakRef = useRef(0);
  const shotsRef = useRef(0);
  const hitsRef = useRef(0);

  // Sound synthesis using Web Audio API
  const playSound = useCallback((type) => {
    if (muted) return;
    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') {
        ctx.resume();
      }

      const now = ctx.currentTime;

      if (type === 'shot') {
        // Noise burst
        const bufferSize = Math.floor(ctx.sampleRate * 0.12);
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
          data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.03));
        }
        const noise = ctx.createBufferSource();
        noise.buffer = buffer;
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(1400, now);
        filter.frequency.exponentialRampToValueAtTime(80, now + 0.12);

        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.8, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.12);

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);
        noise.start(now);

        // Sub kick
        const osc = ctx.createOscillator();
        const oscGain = ctx.createGain();
        osc.frequency.setValueAtTime(180, now);
        osc.frequency.exponentialRampToValueAtTime(35, now + 0.1);
        oscGain.gain.setValueAtTime(0.7, now);
        oscGain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
        osc.connect(oscGain);
        oscGain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.12);
      } else if (type === 'hit') {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(650, now);
        osc.frequency.exponentialRampToValueAtTime(1100, now + 0.14);
        gain.gain.setValueAtTime(0.5, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.16);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.16);
      } else if (type === 'empty') {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(900, now);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.04);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.04);
      } else if (type === 'reload') {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(280, now);
        osc.frequency.linearRampToValueAtTime(620, now + 0.12);
        gain.gain.setValueAtTime(0.25, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.2);
      }
    } catch {
      // AudioContext could be blocked by browser policy before first interaction
    }
  }, [muted]);

  // Reload action
  const handleReload = useCallback(() => {
    if (reloading || ammo === MAX_AMMO) return;
    setReloading(true);
    playSound('reload');
    setTimeout(() => {
      setAmmo(MAX_AMMO);
      setReloading(false);
      playSound('reload');
    }, 450);
  }, [ammo, reloading, playSound]);

  // Keyboard shortcut: R to reload
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === 'r' || e.key === 'R' || e.key === 'к' || e.key === 'К') {
        handleReload();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleReload]);

  // Start game
  const startGame = () => {
    birdsRef.current = [];
    scoreRef.current = 0;
    streakRef.current = 0;
    shotsRef.current = 0;
    hitsRef.current = 0;

    setBirds([]);
    setPopups([]);
    setParticles([]);
    setScore(0);
    setShots(0);
    setHits(0);
    setStreak(0);
    setMaxStreak(0);
    setAmmo(MAX_AMMO);
    setReloading(false);
    setTimeLeft(ROUND_TIME);
    setGameOver(false);
    setGameActive(true);
    lastSpawnRef.current = performance.now();
  };

  // Timer countdown
  useEffect(() => {
    if (!gameActive || mode !== 'timed') return;
    if (timeLeft <= 0) {
      setGameActive(false);
      setGameOver(true);
      return;
    }
    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          setGameActive(false);
          setGameOver(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [gameActive, mode, timeLeft]);

  // Update high score
  useEffect(() => {
    if (score > highScore) {
      setHighScore(score);
      localStorage.setItem('soprano_shooting_highscore', score.toString());
    }
  }, [score, highScore]);

  // Spawn bird
  const spawnBird = useCallback(() => {
    if (!playAreaRef.current) return;
    const rect = playAreaRef.current.getBoundingClientRect();
    const width = rect.width || 800;
    const height = rect.height || 450;

    // Pick random bird type by rarity weights
    const roll = Math.random();
    let cumulative = 0;
    let chosenConfig = BIRD_TYPES[0];
    for (const b of BIRD_TYPES) {
      cumulative += b.rarity;
      if (roll <= cumulative) {
        chosenConfig = b;
        break;
      }
    }

    const fromLeft = Math.random() > 0.5;
    const speed = chosenConfig.speedMin + Math.random() * (chosenConfig.speedMax - chosenConfig.speedMin);
    const startY = 40 + Math.random() * (height - 180);
    const waveFreq = 0.02 + Math.random() * 0.03;
    const waveAmp = 15 + Math.random() * 25;

    const newBird = {
      id: Math.random().toString(),
      type: chosenConfig.type,
      name: chosenConfig.name,
      points: chosenConfig.points,
      width: chosenConfig.width,
      height: chosenConfig.height,
      color: chosenConfig.color,
      accentColor: chosenConfig.accentColor,
      wingColor: chosenConfig.wingColor,
      beakColor: chosenConfig.beakColor,
      isDrone: !!chosenConfig.isDrone,
      x: fromLeft ? -chosenConfig.width - 20 : width + 20,
      y: startY,
      baseY: startY,
      vx: fromLeft ? speed : -speed,
      direction: fromLeft ? 1 : -1,
      waveFreq,
      waveAmp,
      wingPhase: Math.random() * Math.PI,
      isHit: false,
      vy: 0,
    };

    birdsRef.current = [...birdsRef.current, newBird];
    setBirds(birdsRef.current);
  }, []);

  // Main animation / physics loop
  useEffect(() => {
    if (!gameActive) return;

    let lastTime = performance.now();

    const loop = (now) => {
      const dt = (now - lastTime) / 1000;
      lastTime = now;

      // Spawning logic
      if (now - lastSpawnRef.current > 1100 + Math.random() * 800) {
        spawnBird();
        lastSpawnRef.current = now;
      }

      const rect = playAreaRef.current?.getBoundingClientRect();
      const areaWidth = rect?.width || 800;
      const areaHeight = rect?.height || 450;

      // Update birds in ref and state
      const updatedBirds = birdsRef.current
        .map(b => {
          if (b.isHit) {
            // Falling down physics
            return {
              ...b,
              y: b.y + b.vy,
              vy: b.vy + 22 * dt,
              x: b.x + b.vx * 0.3,
            };
          }
          const nextX = b.x + b.vx;
          const nextWingPhase = b.wingPhase + 10 * dt;
          const nextY = b.baseY + Math.sin(nextX * b.waveFreq) * b.waveAmp;
          return {
            ...b,
            x: nextX,
            y: nextY,
            wingPhase: nextWingPhase,
          };
        })
        .filter(b => {
          // Remove if off screen
          if (b.isHit && b.y > areaHeight + 80) return false;
          if (!b.isHit && b.direction === 1 && b.x > areaWidth + 100) return false;
          if (!b.isHit && b.direction === -1 && b.x < -120) return false;
          return true;
        });

      birdsRef.current = updatedBirds;
      setBirds(updatedBirds);

      // Update particles
      setParticles(prev =>
        prev
          .map(p => ({
            ...p,
            x: p.x + p.vx,
            y: p.y + p.vy,
            vy: p.vy + 0.25,
            opacity: p.opacity - 0.025,
          }))
          .filter(p => p.opacity > 0)
      );

      // Update floating popups
      setPopups(prev =>
        prev
          .map(pop => ({
            ...pop,
            y: pop.y - 1.2,
            opacity: pop.opacity - 0.025,
          }))
          .filter(pop => pop.opacity > 0)
      );

      animFrameRef.current = requestAnimationFrame(loop);
    };

    animFrameRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [gameActive, spawnBird]);

  // Click / Shoot handler - synchronous hit detection
  const handleShot = (e) => {
    if (!gameActive || reloading) return;

    if (ammo <= 0) {
      playSound('empty');
      handleReload();
      return;
    }

    // Spend ammo & recoil
    setAmmo(prev => prev - 1);
    shotsRef.current += 1;
    setShots(shotsRef.current);
    playSound('shot');
    setRecoil(true);
    setTimeout(() => setRecoil(false), 80);

    const rect = playAreaRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    // Check hit on active birds synchronously from birdsRef (top visual layer down)
    const currentBirds = birdsRef.current;
    let hitBird = null;
    let hitIndex = -1;

    for (let i = currentBirds.length - 1; i >= 0; i--) {
      const b = currentBirds[i];
      if (b.isHit) continue;

      // Generous hitbox (32px padding on all sides) for immediate snappy feedback
      const hitMargin = 32;
      if (
        clickX >= b.x - hitMargin &&
        clickX <= b.x + b.width + hitMargin &&
        clickY >= b.y - hitMargin &&
        clickY <= b.y + b.height + hitMargin
      ) {
        hitBird = b;
        hitIndex = i;
        break;
      }
    }

    if (hitBird && hitIndex >= 0) {
      // Mark bird as hit
      const nextBirds = [...currentBirds];
      nextBirds[hitIndex] = {
        ...hitBird,
        isHit: true,
        vy: -5,
      };
      birdsRef.current = nextBirds;
      setBirds(nextBirds);

      // Increment hits & streak
      hitsRef.current += 1;
      setHits(hitsRef.current);

      streakRef.current += 1;
      const newStreak = streakRef.current;
      setStreak(newStreak);
      setMaxStreak(prev => Math.max(prev, newStreak));

      // Calculate score with combo multiplier
      const multiplier = newStreak >= 5 ? 2.0 : newStreak >= 3 ? 1.5 : 1.0;
      const gainedScore = Math.round(hitBird.points * multiplier);
      scoreRef.current += gainedScore;
      setScore(scoreRef.current);

      playSound('hit');

      // Create floating text popup
      setPopups(prev => [
        ...prev,
        {
          id: Math.random(),
          x: clickX,
          y: clickY - 10,
          text: `+${gainedScore}${multiplier > 1 ? ` (x${multiplier})` : ''}`,
          color: multiplier > 1 ? '#ef4444' : '#22c55e',
          opacity: 1,
        },
      ]);

      // Spawn feather/explosion particles
      const newParticles = [];
      const count = hitBird.isDrone ? 18 : 12;
      for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 1.5 + Math.random() * 4.5;
        newParticles.push({
          id: Math.random(),
          x: clickX,
          y: clickY,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 1.5,
          color: i % 2 === 0 ? hitBird.accentColor : hitBird.color,
          size: hitBird.isDrone ? 3 + Math.random() * 4 : 4 + Math.random() * 6,
          opacity: 1,
        });
      }
      setParticles(prev => [...prev, ...newParticles]);
    } else {
      // Miss: reset streak
      streakRef.current = 0;
      setStreak(0);
    }
  };

  const accuracy = shots > 0 ? Math.round((hits / shots) * 100) : 0;

  return (
    <>
      <div className="page-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <h1>Тир Soprano: Охота на птиц</h1>
            <p>Стрельба по летающим мишеням в фирменном стиле Soprano</p>
          </div>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => setMuted(!muted)}
            >
              {muted ? 'Без звука' : 'Звук вкл'}
            </button>
            <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
              Рекорд: <strong style={{ color: 'var(--accent)' }}>{highScore}</strong> очков
            </div>
          </div>
        </div>
      </div>

      <div className="page-body" style={{ maxWidth: '1200px', margin: '0 auto' }}>
        {/* TOP STATS DASHBOARD */}
        <div className="stats-grid" style={{ marginBottom: '16px' }}>
          <div className="stat-card">
            <div className="label">Текущий счёт</div>
            <div className="value" style={{ color: 'var(--text-primary)' }}>{score}</div>
          </div>
          <div className="stat-card">
            <div className="label">{mode === 'timed' ? 'Осталось времени' : 'Режим'}</div>
            <div className="value" style={{ color: mode === 'timed' && timeLeft <= 10 ? 'var(--danger)' : 'var(--accent)' }}>
              {mode === 'timed' ? `${timeLeft} с` : 'Бесконечный'}
            </div>
          </div>
          <div className="stat-card">
            <div className="label">Меткость</div>
            <div className="value" style={{ color: accuracy >= 70 ? 'var(--success)' : 'var(--text-primary)' }}>
              {accuracy}% <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>({hits}/{shots})</span>
            </div>
          </div>
          <div className="stat-card">
            <div className="label">Серия попаданий</div>
            <div className="value" style={{ color: streak >= 5 ? 'var(--danger)' : streak >= 3 ? 'var(--warning)' : 'var(--text-primary)' }}>
              {streak} <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>(макс: {maxStreak})</span>
            </div>
          </div>
        </div>

        {/* CONTROLS BAR */}
        <div className="card" style={{ padding: '12px 20px', marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            {!gameActive ? (
              <button className="btn btn-primary" onClick={startGame}>
                {gameOver ? 'Начать заново' : 'Начать охоту'}
              </button>
            ) : (
              <button className="btn btn-secondary" onClick={() => setGameActive(false)}>
                Пауза
              </button>
            )}

            <div style={{ display: 'flex', gap: '6px', background: 'var(--bg-tertiary)', padding: '3px', borderRadius: 'var(--radius-sm)' }}>
              <button
                className={`btn btn-sm ${mode === 'timed' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ border: 'none' }}
                onClick={() => { setMode('timed'); if (!gameActive) setTimeLeft(ROUND_TIME); }}
                disabled={gameActive}
              >
                Таймер (60с)
              </button>
              <button
                className={`btn btn-sm ${mode === 'endless' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ border: 'none' }}
                onClick={() => setMode('endless')}
                disabled={gameActive}
              >
                Бесконечный
              </button>
            </div>
          </div>

          {/* AMMO REVOLVER INDICATOR */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <span style={{ fontSize: '12px', color: 'var(--text-secondary)', marginRight: '4px' }}>Барабан:</span>
              {Array.from({ length: MAX_AMMO }).map((_, idx) => (
                <div
                  key={idx}
                  style={{
                    width: '10px',
                    height: '24px',
                    borderRadius: '3px 3px 1px 1px',
                    background: idx < ammo
                      ? 'linear-gradient(180deg, #d32f2f 0%, #8b0000 100%)'
                      : 'var(--border-color)',
                    border: '1px solid ' + (idx < ammo ? '#e53935' : '#444'),
                    boxShadow: idx < ammo ? '0 0 6px rgba(211,47,47,0.5)' : 'none',
                    transition: 'all 0.15s ease',
                  }}
                />
              ))}
            </div>

            <button
              className="btn btn-secondary btn-sm"
              onClick={handleReload}
              disabled={reloading || ammo === MAX_AMMO}
              title="Горячая клавиша: R"
            >
              {reloading ? 'Перезарядка...' : 'Перезарядить (R)'}
            </button>
          </div>
        </div>

        {/* SHOOTING RANGE CANVAS CONTAINER */}
        <div
          ref={playAreaRef}
          onClick={handleShot}
          onMouseMove={(e) => {
            const rect = playAreaRef.current?.getBoundingClientRect();
            if (rect && crosshairRef.current) {
              const x = e.clientX - rect.left;
              const y = e.clientY - rect.top;
              crosshairRef.current.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%)`;
            }
          }}
          onMouseEnter={() => setIsInsideArea(true)}
          onMouseLeave={() => setIsInsideArea(false)}
          style={{
            position: 'relative',
            width: '100%',
            height: '520px',
            background: 'radial-gradient(circle at 50% 30%, #1e1e28 0%, #0c0c10 70%, #050508 100%)',
            border: '2px solid var(--border-color)',
            borderRadius: 'var(--radius)',
            overflow: 'hidden',
            cursor: gameActive && isInsideArea ? 'none' : 'default',
            userSelect: 'none',
            boxShadow: recoil ? '0 0 40px rgba(211,47,47,0.45)' : 'inset 0 0 80px rgba(0,0,0,0.8)',
            transform: recoil ? 'scale(0.996)' : 'none',
            transition: 'transform 0.06s ease, box-shadow 0.08s ease',
          }}
        >
          {/* NIGHT SKY STARS & RED MOON */}
          <div
            style={{
              position: 'absolute',
              top: '30px',
              right: '60px',
              width: '80px',
              height: '80px',
              borderRadius: '50%',
              background: 'radial-gradient(circle at 35% 35%, #ffffff 0%, #d32f2f 60%, #500 100%)',
              boxShadow: '0 0 45px rgba(211,47,47,0.6)',
              opacity: 0.85,
              pointerEvents: 'none',
            }}
          />

          {/* BACKGROUND CITYLINE SILHOUETTE */}
          <svg
            viewBox="0 0 1000 200"
            preserveAspectRatio="none"
            style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              width: '100%',
              height: '140px',
              opacity: 0.35,
              pointerEvents: 'none',
            }}
          >
            <path
              d="M0,200 L0,120 L40,120 L40,90 L70,90 L70,140 L120,140 L120,70 L150,70 L150,110 L190,110 L190,50 L230,50 L230,150 L290,150 L290,80 L340,80 L340,130 L400,130 L400,60 L440,60 L440,160 L500,160 L500,75 L540,75 L540,110 L590,110 L590,45 L630,45 L630,130 L700,130 L700,85 L750,85 L750,150 L810,150 L810,65 L860,65 L860,120 L920,120 L920,95 L960,95 L960,150 L1000,150 L1000,200 Z"
              fill="#08080c"
            />
          </svg>

          {/* BIRDS LAYER */}
          {birds.map(b => {
            const isFlipped = b.direction === -1;
            const wingY = Math.sin(b.wingPhase) * 14;

            return (
              <div
                key={b.id}
                style={{
                  position: 'absolute',
                  left: `${b.x}px`,
                  top: `${b.y}px`,
                  width: `${b.width}px`,
                  height: `${b.height}px`,
                  transform: `${isFlipped ? 'scaleX(-1)' : 'scaleX(1)'} ${b.isHit ? 'rotate(110deg)' : ''}`,
                  transition: b.isHit ? 'transform 0.2s' : 'none',
                  pointerEvents: 'none',
                }}
              >
                {!b.isDrone ? (
                  // BIRD SVG (Organic avian silhouette with beating wings)
                  <svg viewBox="0 0 60 40" style={{ width: '100%', height: '100%', overflow: 'visible' }}>
                    {/* Far Wing */}
                    <path
                      d={`M24,20 Q15,${5 - wingY} 5,${10 - wingY * 1.2} Q16,${18 - wingY * 0.5} 22,22`}
                      fill={b.wingColor}
                      opacity={0.8}
                    />
                    {/* Bird Body */}
                    <ellipse cx="30" cy="22" rx="16" ry="9" fill={b.color} />
                    {/* Tail feathers */}
                    <path d="M14,22 L2,18 L6,25 L2,28 Z" fill={b.accentColor} />
                    {/* Head */}
                    <circle cx="44" cy="18" r="7" fill={b.color} />
                    {/* Eye */}
                    <circle cx="47" cy="16" r="1.6" fill={b.accentColor} />
                    {/* Beak */}
                    <polygon points="50,16 58,19 50,21" fill={b.beakColor} />
                    {/* Near Wing */}
                    <path
                      d={`M26,20 Q20,${2 + wingY} 8,${6 + wingY * 1.3} Q20,${16 + wingY * 0.6} 28,24`}
                      fill={b.wingColor}
                      filter="drop-shadow(0px 2px 3px rgba(0,0,0,0.4))"
                    />
                  </svg>
                ) : (
                  // SPY DRONE SVG (Sci-Fi Quadcopter)
                  <svg viewBox="0 0 60 30" style={{ width: '100%', height: '100%' }}>
                    <rect x="18" y="10" width="24" height="10" rx="3" fill="#1e1e28" stroke="#ef4444" strokeWidth="1.5" />
                    <line x1="8" y1="15" x2="52" y2="15" stroke="#fff" strokeWidth="2" />
                    {/* Rotors */}
                    <ellipse cx="10" cy="15" rx="9" ry="2" fill="none" stroke="#ef4444" strokeWidth="1.5" />
                    <ellipse cx="50" cy="15" rx="9" ry="2" fill="none" stroke="#ef4444" strokeWidth="1.5" />
                    {/* Camera eye */}
                    <circle cx="30" cy="15" r="3" fill="#ef4444" />
                    <circle cx="30" cy="15" r="1" fill="#fff" />
                  </svg>
                )}
              </div>
            );
          })}

          {/* PARTICLES (FEATHERS / SHARDS) */}
          {particles.map(p => (
            <div
              key={p.id}
              style={{
                position: 'absolute',
                left: `${p.x}px`,
                top: `${p.y}px`,
                width: `${p.size}px`,
                height: `${p.size * 0.6}px`,
                background: p.color,
                borderRadius: '50% 20% 50% 20%',
                opacity: p.opacity,
                pointerEvents: 'none',
                transform: `rotate(${p.vx * 30}deg)`,
              }}
            />
          ))}

          {/* FLOATING HIT POINTS POPUPS */}
          {popups.map(pop => (
            <div
              key={pop.id}
              style={{
                position: 'absolute',
                left: `${pop.x}px`,
                top: `${pop.y}px`,
                color: pop.color,
                fontWeight: '800',
                fontSize: '18px',
                textShadow: '0 0 8px rgba(0,0,0,0.9), 0 0 14px ' + pop.color,
                opacity: pop.opacity,
                pointerEvents: 'none',
                transform: 'translate(-50%, -50%)',
                letterSpacing: '0.5px',
              }}
            >
              {pop.text}
            </div>
          ))}

          {/* CUSTOM TACTICAL CROSSHAIR */}
          <div
            ref={crosshairRef}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              transform: 'translate3d(-100px, -100px, 0) translate(-50%, -50%)',
              pointerEvents: 'none',
              zIndex: 100,
              display: gameActive && isInsideArea ? 'block' : 'none',
              willChange: 'transform',
            }}
          >
              <div
                style={{
                  width: '36px',
                  height: '36px',
                  border: '1.5px solid rgba(229,57,53,0.85)',
                  borderRadius: '50%',
                  position: 'relative',
                  boxShadow: '0 0 10px rgba(211,47,47,0.5)',
                }}
              >
                {/* Center red pip */}
                <div
                  style={{
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    width: '4px',
                    height: '4px',
                    background: '#ffffff',
                    borderRadius: '50%',
                    transform: 'translate(-50%, -50%)',
                  }}
                />
                {/* Crosshair ticks */}
                <div style={{ position: 'absolute', top: '-6px', left: '50%', width: '2px', height: '6px', background: '#e53935', transform: 'translateX(-50%)' }} />
                <div style={{ position: 'absolute', bottom: '-6px', left: '50%', width: '2px', height: '6px', background: '#e53935', transform: 'translateX(-50%)' }} />
                <div style={{ position: 'absolute', left: '-6px', top: '50%', width: '6px', height: '2px', background: '#e53935', transform: 'translateY(-50%)' }} />
                <div style={{ position: 'absolute', right: '-6px', top: '50%', width: '6px', height: '2px', background: '#e53935', transform: 'translateY(-50%)' }} />
              </div>
            </div>

          {/* EMPTY AMMO FLASH WARNING */}
          {gameActive && ammo === 0 && (
            <div
              style={{
                position: 'absolute',
                bottom: '30px',
                left: '50%',
                transform: 'translateX(-50%)',
                background: 'rgba(211,47,47,0.85)',
                color: '#fff',
                padding: '8px 18px',
                borderRadius: '6px',
                fontWeight: '700',
                fontSize: '14px',
                boxShadow: '0 0 18px rgba(211,47,47,0.8)',
                letterSpacing: '1px',
                animation: 'pulse 0.8s infinite',
                pointerEvents: 'none',
              }}
            >
              НЕТ ПАТРОНОВ! НАЖМИТЕ [R] ДЛЯ ПЕРЕЗАРЯДКИ
            </div>
          )}

          {/* START / GAME OVER OVERLAY */}
          {(!gameActive || gameOver) && (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                background: 'rgba(10, 10, 12, 0.88)',
                backdropFilter: 'blur(5px)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '16px',
                zIndex: 10,
              }}
            >
              {gameOver ? (
                <>
                  <h2 style={{ fontSize: '28px', color: 'var(--accent)', margin: 0, letterSpacing: '-0.5px' }}>
                    Охота завершена!
                  </h2>
                  <div style={{ textAlign: 'center', color: 'var(--text-secondary)', fontSize: '15px' }}>
                    <p style={{ margin: '4px 0' }}>Набрано очков: <strong style={{ color: '#fff', fontSize: '20px' }}>{score}</strong></p>
                    <p style={{ margin: '4px 0' }}>Точность стрельбы: <strong style={{ color: '#fff' }}>{accuracy}%</strong> ({hits} из {shots})</p>
                    <p style={{ margin: '4px 0' }}>Максимальная серия: <strong style={{ color: '#fff' }}>{maxStreak}</strong></p>
                    {score >= highScore && score > 0 && (
                      <p style={{ color: '#f59e0b', fontWeight: '700', marginTop: '8px' }}>★ Новый персональный рекорд! ★</p>
                    )}
                  </div>
                  <button className="btn btn-primary" style={{ padding: '12px 28px', fontSize: '15px' }} onClick={startGame}>
                    Сыграть снова
                  </button>
                </>
              ) : (
                <>
                  <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: 'var(--accent-glow)', border: '1px solid var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="#e53935" strokeWidth="2" style={{ width: '30px', height: '30px' }}>
                      <circle cx="12" cy="12" r="10" />
                      <line x1="22" y1="12" x2="18" y2="12" />
                      <line x1="6" y1="12" x2="2" y2="12" />
                      <line x1="12" y1="6" x2="12" y2="2" />
                      <line x1="12" y1="22" x2="12" y2="18" />
                    </svg>
                  </div>
                  <h2 style={{ fontSize: '24px', margin: 0 }}>Тир Soprano</h2>
                  <p style={{ color: 'var(--text-secondary)', maxWidth: '440px', textAlign: 'center', fontSize: '14px', lineHeight: 1.5 }}>
                    Кликайте по птицам для выстрела. В барабане 6 патронов. Нажимайте клавишу <strong>[R]</strong> для быстрой перезарядки. Серии попаданий приносят множитель очков!
                  </p>
                  <button className="btn btn-primary" style={{ padding: '12px 32px', fontSize: '15px' }} onClick={startGame}>
                    Начать охоту
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        {/* TARGETS / BIRDS VALUE LEGEND */}
        <div className="card" style={{ marginTop: '20px' }}>
          <h3 style={{ fontSize: '15px', marginBottom: '14px' }}>Виды мишеней и ценность</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px' }}>
            {BIRD_TYPES.map(b => (
              <div
                key={b.type}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  background: 'var(--bg-tertiary)',
                  padding: '10px 14px',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border-color)',
                }}
              >
                <div
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '50%',
                    background: b.color,
                    border: '1.5px solid ' + b.accentColor,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: b.accentColor }} />
                </div>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: '600' }}>{b.name}</div>
                  <div style={{ fontSize: '12px', color: 'var(--accent)', fontWeight: '700' }}>
                    +{b.points} очков
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
