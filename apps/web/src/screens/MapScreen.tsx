import { motion } from 'framer-motion';
import { BOSS_NODE, canHunt, reachableNodes } from '@snac-hunters/engine';
import type { GameState, MapNode } from '@snac-hunters/engine';
import { Button } from '../components/Button';
import { Hud } from '../components/Hud';
import { typeName } from '../game/i18n';
import { useGame } from '../game/store';
import { useT } from '../game/useT';

interface Point {
  readonly x: number;
  readonly y: number;
}

// Margen para que los nodos de los extremos (56 px) no se corten en pantallas de 360 px
const TOWN: Point = { x: 9, y: 50 };
const BOSS: Point = { x: 89, y: 50 };

/** Posición (en %) de cada nodo: columnas repartidas entre el pueblo y el jefe. */
function layout(nodes: readonly MapNode[], columns: number): Map<string, Point> {
  const span = BOSS.x - TOWN.x;
  const points = new Map<string, Point>([[BOSS_NODE, BOSS]]);
  for (let c = 0; c < columns; c++) {
    const col = nodes.filter((n) => n.column === c);
    col.forEach((n, i) => {
      points.set(n.id, {
        x: TOWN.x + ((c + 1) * span) / (columns + 1),
        y: ((i + 1) * 100) / (col.length + 1),
      });
    });
  }
  return points;
}

/**
 * Mapa estilo FTL de Sherbet Forest (feedback, sección 7): se ve completo, del pueblo a la
 * izquierda al jefe a la derecha. En cada paso se elige un nodo conectado; solo se conoce el
 * tipo de SNAC de cada nodo (monstruos ocultos).
 */
export function MapScreen({ game }: { game: GameState }) {
  const t = useT();
  const act = useGame((s) => s.act);
  const map = game.map;
  const run = game.run;
  if (!map || !run) return null;
  const points = layout(map.nodes, map.columns);
  const reachable = canHunt(run) ? reachableNodes(game) : [];
  const from = game.position === null ? TOWN : (points.get(game.position) ?? TOWN);
  const edges: [Point, Point, boolean][] = [
    ...map.nodes
      .filter((n) => n.column === 0)
      .map((n): [Point, Point, boolean] => [TOWN, points.get(n.id)!, game.position === null]),
    ...map.nodes.flatMap((n) =>
      n.next.map((to): [Point, Point, boolean] => [
        points.get(n.id)!,
        points.get(to)!,
        n.id === game.position,
      ]),
    ),
  ];

  return (
    <div className="flex min-h-[100dvh] flex-col gap-3 px-3 py-3">
      <Hud game={game} />
      <div className="text-center text-white">
        <h1 className="font-comic text-3xl drop-shadow-[0_3px_0_#000]">{t('map.title')}</h1>
        <p className="text-sm">{t('map.subtitle', { run: game.runs, n: run.pool.length })}</p>
      </div>

      <section
        data-guide-target="map"
        aria-label={t('map.title')}
        className="relative h-[360px] overflow-hidden rounded-3xl border-4 border-black bg-cover bg-center"
        style={{
          backgroundImage:
            'linear-gradient(rgba(20,10,0,.35),rgba(20,10,0,.55)),url(/assets/bg/sherbert-forest.png)',
        }}
      >
        <svg
          className="absolute inset-0 h-full w-full"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          aria-hidden
        >
          {edges.map(([a, b, active], i) => (
            <line
              key={i}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke={active ? '#fde047' : 'rgba(255,255,255,0.45)'}
              strokeWidth={active ? 1.1 : 0.6}
              strokeDasharray={active ? undefined : '1.5 1.5'}
              vectorEffect="non-scaling-stroke"
              style={{ strokeWidth: active ? 4 : 2 }}
            />
          ))}
        </svg>

        <Spot point={TOWN} label={t('map.town')} current={game.position === null}>
          <img src="/assets/icons/sherbert-forest.png" alt="" className="h-8 w-8 object-contain" />
        </Spot>

        {map.nodes.map((n) => {
          const point = points.get(n.id)!;
          const open = reachable.includes(n.id);
          return (
            <Spot
              key={n.id}
              point={point}
              label={t('map.node', { type: typeName(t, n.type) })}
              current={game.position === n.id}
              open={open}
              onClick={open ? () => act({ type: 'follow', node: n.id }) : undefined}
            >
              <img
                src={`/assets/trophies/${n.type.toLowerCase()}.png`}
                alt=""
                className="h-8 w-7 object-contain"
              />
            </Spot>
          );
        })}

        <Spot
          point={BOSS}
          label={t('map.bossNode', { name: game.boss.name })}
          open={reachable.includes(BOSS_NODE)}
          boss
          onClick={
            reachable.includes(BOSS_NODE)
              ? () => act({ type: 'follow', node: BOSS_NODE })
              : undefined
          }
        >
          <img src="/assets/monsters/pieous.png" alt="" className="h-11 w-11 object-contain" />
        </Spot>

        {/* El cazador marca dónde está */}
        <motion.img
          src="/assets/huntmaster.png"
          alt=""
          className="pointer-events-none absolute h-9 w-9 object-contain drop-shadow-[0_2px_0_#000]"
          style={{ x: '-50%' }}
          animate={{ left: `${from.x}%`, top: `calc(${from.y}% - 46px)` }}
          transition={{ type: 'spring', stiffness: 120, damping: 16 }}
        />
      </section>

      <p className="text-center text-sm text-white/90">
        {reachable.length > 0 ? t('map.pick') : t('map.noDice')}
      </p>

      <Button variant="secondary" className="mt-auto" onClick={() => act({ type: 'return' })}>
        {t('map.return')}
      </Button>
    </div>
  );
}

function Spot(props: {
  point: Point;
  label: string;
  children: React.ReactNode;
  current?: boolean;
  open?: boolean;
  boss?: boolean;
  onClick?: () => void;
}) {
  const { point, open = false, current = false, boss = false } = props;
  const size = boss ? 'h-14 w-14' : 'h-12 w-12';
  return (
    <motion.button
      type="button"
      aria-label={props.label}
      onClick={props.onClick}
      disabled={!props.onClick}
      animate={open ? { scale: [1, 1.12, 1] } : { scale: 1 }}
      transition={open ? { repeat: Infinity, duration: 1.1 } : {}}
      className={`absolute ${size} grid place-items-center rounded-full border-[3px] ${
        open
          ? 'border-yellow-300 bg-sherbet shadow-[0_0_16px_4px_rgba(253,224,71,0.8)]'
          : current
            ? 'border-white bg-sherbet'
            : boss
              ? 'border-black bg-red-200/90'
              : 'border-black bg-sherbet/70'
      } ${!open && !current && !boss ? 'opacity-75' : ''}`}
      // Framer Motion maneja el transform (pulso), así que el centrado va con x/y, no con Tailwind
      style={{ left: `${point.x}%`, top: `${point.y}%`, x: '-50%', y: '-50%' }}
    >
      {props.children}
    </motion.button>
  );
}
