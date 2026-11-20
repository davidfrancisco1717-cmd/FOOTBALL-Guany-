export type TeamSide = 'home' | 'away';

export type PlayerRole = 'GR' | 'DEF' | 'MED' | 'AVA';

export type PlayerAnimState =
  | 'idle'
  | 'walk'
  | 'run'
  | 'sprint'
  | 'brake'
  | 'turn'
  | 'dribble'
  | 'shield'
  | 'firstTouch'
  | 'pass'
  | 'shoot'
  | 'lowShot'
  | 'finesseShot'
  | 'volley'
  | 'cross'
  | 'jump'
  | 'header'
  | 'tackle'
  | 'fall'
  | 'celebrate'
  | 'gkSave'
  | 'gkLowSave'
  | 'gkCatch';

export type AIState =
  | 'ATTACK_CARRY'
  | 'ATTACK_SUPPORT'
  | 'ATTACK_RUN'
  | 'DEFEND_MARK'
  | 'INTERCEPT_PASS'
  | 'PRESS_BALL'
  | 'RECOVER_LOOSE'
  | 'SHOOT'
  | 'PASS'
  | 'RETREAT'
  | 'GK_TRACK'
  | 'GK_DIVE'
  | 'GK_HOLD'
  | 'GK_DISTRIBUTE';

export type StadiumTime = 'day' | 'night';
export type CameraMode = 'tv' | 'psp';
export type QualityLevel = 'low' | 'medium' | 'high';
export type RenderDistance = 'short' | 'medium' | 'long';
export type TouchControlsMode = 'auto' | 'always' | 'hidden';
export type GameMode = 'quick_match' | 'training';

export type MatchPhase =
  | 'PRE_MATCH'
  | 'KICKOFF'
  | 'PLAYING'
  | 'GOAL'
  | 'RESET'
  | 'OUT_OF_BOUNDS'
  | 'HALFTIME'
  | 'FULLTIME';

export type ScreenState =
  | 'menu'
  | 'teams'
  | 'stadiums'
  | 'settings'
  | 'playing'
  | 'paused'
  | 'results';

export interface GameSettings {
  quality: QualityLevel;
  fpsLimit: 30 | 60 | 0; // 0 = ilimitado
  shadows: boolean;
  renderDistance: RenderDistance;
  cameraMode: CameraMode;
  cameraZoom: number; // 0.75 .. 1.35
  touchControlsMode: TouchControlsMode;
  soundEnabled: boolean;
  commentatorEnabled: boolean;
  volume: number; // 0 .. 1
  matchMinutes: 2 | 3 | 5;
}

export const DEFAULT_SETTINGS: GameSettings = {
  quality: 'medium',
  fpsLimit: 60,
  shadows: true,
  renderDistance: 'medium',
  cameraMode: 'tv',
  cameraZoom: 1.0,
  touchControlsMode: 'auto',
  soundEnabled: true,
  commentatorEnabled: true,
  volume: 0.75,
  matchMinutes: 3,
};

export interface PlayerRosterEntry {
  name: string;
  number: number;
  role: PlayerRole;
  skinColor: string;
  hairColor: string;
  speedStat: number; // 0.90 .. 1.08
  skillStat: number; // 0.90 .. 1.08
}

export interface TeamPreset {
  id: string;
  name: string;
  shortName: string;
  city: string;
  rating: number;
  primaryColor: string;
  secondaryColor: string;
  shortsColor: string;
  socksColor: string;
  gkColor: string;
  roster: PlayerRosterEntry[];
}

export interface StadiumPreset {
  id: StadiumTime;
  name: string;
  subtitle: string;
  description: string;
  attendance: string;
}

export const STADIUM_PRESETS: StadiumPreset[] = [
  {
    id: 'day',
    name: 'Arena do Sol (Dia)',
    subtitle: 'Céu limpo · Luz natural',
    description:
      'Relvado iluminado pela luz solar da tarde, sombras definidas e ambiente vibrante de campeonato.',
    attendance: '38.400 espetadores',
  },
  {
    id: 'night',
    name: 'Estádio Metropolitano (Noite)',
    subtitle: 'Holofotes LED · Clássico noturno',
    description:
      'Torre de holofotes acesos, painéis luminosos ao redor do campo e atmosfera elétrica de grande final.',
    attendance: '42.000 espetadores',
  },
];

export const TEAMS: TeamPreset[] = [
  {
    id: 'dragoes',
    name: 'Dragões Azuis',
    shortName: 'DRA',
    city: 'Porto',
    rating: 86,
    primaryColor: '#1d4ed8',
    secondaryColor: '#f8fafc',
    shortsColor: '#0f172a',
    socksColor: '#1d4ed8',
    gkColor: '#f59e0b',
    roster: [
      { name: 'Diogo Costa', number: 1, role: 'GR', skinColor: '#f1c29b', hairColor: '#2c1e16', speedStat: 0.95, skillStat: 1.04 },
      { name: 'Pepe Silva', number: 4, role: 'DEF', skinColor: '#e2ae85', hairColor: '#1f1916', speedStat: 0.96, skillStat: 1.01 },
      { name: 'Vitinha Cruz', number: 8, role: 'MED', skinColor: '#f3c6a0', hairColor: '#3b281c', speedStat: 1.02, skillStat: 1.05 },
      { name: 'Otávio Reis', number: 10, role: 'MED', skinColor: '#d99e73', hairColor: '#191412', speedStat: 1.03, skillStat: 1.04 },
      { name: 'Samu Braga', number: 9, role: 'AVA', skinColor: '#6f452d', hairColor: '#120e0d', speedStat: 1.07, skillStat: 1.05 },
    ],
  },
  {
    id: 'leoes',
    name: 'Leões Verdes',
    shortName: 'LEO',
    city: 'Lisboa',
    rating: 85,
    primaryColor: '#15803d',
    secondaryColor: '#ffffff',
    shortsColor: '#052e16',
    socksColor: '#15803d',
    gkColor: '#0284c7',
    roster: [
      { name: 'Rui Patrício', number: 1, role: 'GR', skinColor: '#efc099', hairColor: '#2a1d14', speedStat: 0.94, skillStat: 1.03 },
      { name: 'Inácio Dias', number: 4, role: 'DEF', skinColor: '#f4caaa', hairColor: '#3c2a1e', speedStat: 0.98, skillStat: 1.02 },
      { name: 'Hjulmand Neves', number: 8, role: 'MED', skinColor: '#f8d8be', hairColor: '#b5894b', speedStat: 1.0, skillStat: 1.03 },
      { name: 'Pote Marques', number: 10, role: 'MED', skinColor: '#ecc098', hairColor: '#291c15', speedStat: 1.03, skillStat: 1.06 },
      { name: 'Viktor Almeida', number: 9, role: 'AVA', skinColor: '#f6d2b6', hairColor: '#916c3c', speedStat: 1.08, skillStat: 1.05 },
    ],
  },
  {
    id: 'aguias',
    name: 'Águias Vermelhas',
    shortName: 'AGU',
    city: 'Luz',
    rating: 84,
    primaryColor: '#dc2626',
    secondaryColor: '#f8fafc',
    shortsColor: '#f8fafc',
    socksColor: '#dc2626',
    gkColor: '#84cc16',
    roster: [
      { name: 'Trubin Melo', number: 1, role: 'GR', skinColor: '#f6d5ba', hairColor: '#6e5032', speedStat: 0.94, skillStat: 1.04 },
      { name: 'António Gomes', number: 4, role: 'DEF', skinColor: '#f1c29b', hairColor: '#2d2018', speedStat: 0.98, skillStat: 1.01 },
      { name: 'Kokçu Nunes', number: 8, role: 'MED', skinColor: '#e8b68e', hairColor: '#1f1713', speedStat: 1.01, skillStat: 1.05 },
      { name: 'Di Maria Lopes', number: 10, role: 'MED', skinColor: '#ecc09a', hairColor: '#271c16', speedStat: 1.04, skillStat: 1.07 },
      { name: 'Pavlidis Vaz', number: 9, role: 'AVA', skinColor: '#e4b38c', hairColor: '#1b1411', speedStat: 1.05, skillStat: 1.04 },
    ],
  },
  {
    id: 'lusitana',
    name: 'Seleção Lusitana',
    shortName: 'LUS',
    city: 'Portugal',
    rating: 88,
    primaryColor: '#991b1b',
    secondaryColor: '#fbbf24',
    shortsColor: '#14532d',
    socksColor: '#991b1b',
    gkColor: '#06b6d4',
    roster: [
      { name: 'Beto Ramos', number: 1, role: 'GR', skinColor: '#ecc19c', hairColor: '#271b14', speedStat: 0.95, skillStat: 1.05 },
      { name: 'Rúben Fonte', number: 4, role: 'DEF', skinColor: '#e9bb94', hairColor: '#201814', speedStat: 0.98, skillStat: 1.04 },
      { name: 'Bruno Maia', number: 8, role: 'MED', skinColor: '#efc29b', hairColor: '#2e2017', speedStat: 1.03, skillStat: 1.07 },
      { name: 'Bernardo Pires', number: 10, role: 'MED', skinColor: '#f3caa7', hairColor: '#36271d', speedStat: 1.04, skillStat: 1.08 },
      { name: 'Rafael Leão', number: 9, role: 'AVA', skinColor: '#6d442b', hairColor: '#100d0c', speedStat: 1.09, skillStat: 1.06 },
    ],
  },
  {
    id: 'estrela',
    name: 'Atlético Estrela',
    shortName: 'EST',
    city: 'Braga',
    rating: 81,
    primaryColor: '#eab308',
    secondaryColor: '#0f172a',
    shortsColor: '#0f172a',
    socksColor: '#eab308',
    gkColor: '#ec4899',
    roster: [
      { name: 'Matheus Leal', number: 1, role: 'GR', skinColor: '#d99e73', hairColor: '#171210', speedStat: 0.94, skillStat: 1.0 },
      { name: 'Niakaté Rocha', number: 4, role: 'DEF', skinColor: '#5c3823', hairColor: '#0d0a09', speedStat: 0.97, skillStat: 0.99 },
      { name: 'Moutinho Sá', number: 8, role: 'MED', skinColor: '#f0c39d', hairColor: '#2d2018', speedStat: 0.99, skillStat: 1.04 },
      { name: 'Horta Ferreira', number: 10, role: 'MED', skinColor: '#f2c7a2', hairColor: '#35241a', speedStat: 1.02, skillStat: 1.03 },
      { name: 'Banza Tavares', number: 9, role: 'AVA', skinColor: '#633c26', hairColor: '#0f0c0b', speedStat: 1.04, skillStat: 1.02 },
    ],
  },
  {
    id: 'titas',
    name: 'Titãs Negros',
    shortName: 'TIT',
    city: 'Coimbra',
    rating: 82,
    primaryColor: '#1e293b',
    secondaryColor: '#38bdf8',
    shortsColor: '#0f172a',
    socksColor: '#38bdf8',
    gkColor: '#f97316',
    roster: [
      { name: 'Micael Costa', number: 1, role: 'GR', skinColor: '#efc19b', hairColor: '#231914', speedStat: 0.95, skillStat: 1.01 },
      { name: 'Tavares Pinto', number: 4, role: 'DEF', skinColor: '#d89b70', hairColor: '#181311', speedStat: 0.98, skillStat: 1.0 },
      { name: 'Nuno Morais', number: 8, role: 'MED', skinColor: '#f1c5a0', hairColor: '#2c1e16', speedStat: 1.01, skillStat: 1.02 },
      { name: 'Guedes Moura', number: 10, role: 'MED', skinColor: '#eab990', hairColor: '#221813', speedStat: 1.03, skillStat: 1.03 },
      { name: 'Paulinho Luz', number: 9, role: 'AVA', skinColor: '#e7b68d', hairColor: '#1e1612', speedStat: 1.05, skillStat: 1.03 },
    ],
  },
];

export const PITCH_LENGTH = 64; // X from -32 to +32
export const PITCH_WIDTH = 40; // Z from -20 to +20
export const HALF_LENGTH = PITCH_LENGTH / 2; // 32
export const HALF_WIDTH = PITCH_WIDTH / 2; // 20
export const GOAL_WIDTH = 6.4; // Z from -3.2 to +3.2
export const GOAL_HALF_WIDTH = GOAL_WIDTH / 2; // 3.2
export const GOAL_HEIGHT = 2.4;
export const GOAL_DEPTH = 2.0;
export const BALL_RADIUS = 0.22;

export interface RadarDot {
  x: number; // normalized -1..1 along length
  z: number; // normalized -1..1 along width
  team: TeamSide | 'ball';
  active?: boolean;
}

export interface HudSnapshot {
  homeTeam: TeamPreset;
  awayTeam: TeamPreset;
  homeScore: number;
  awayScore: number;
  displayMinute: number;
  displaySecond: number;
  half: 1 | 2;
  phase: MatchPhase;
  kickoffTeam: TeamSide;
  mode: GameMode;
  possessionTeam: TeamSide | null;
  homePossessionPct: number;
  activePlayerName: string;
  activePlayerNumber: number;
  activePlayerRole: PlayerRole;
  activePlayerStamina: number;
  shotCharge: number; // 0..1
  teamHasBall: boolean;
  lastGoalScorer: string;
  lastGoalTeam: TeamSide | null;
  statusToast: string;
  commentaryLine: string;
  homeShots: number;
  awayShots: number;
  homePasses: number;
  awayPasses: number;
  homeTackles: number;
  awayTackles: number;
  radarDots: RadarDot[];
}
