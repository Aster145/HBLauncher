#ifndef SNAKE_GAME_GLSL
#define SNAKE_GAME_GLSL
// App-only state: absolute bytes 2401024..2405951. Textures stay below
// 2 MiB and the SDK extension starts at 0x7f0000. Include abi.glsl first.
const uint SNAKE_W=30u, SNAKE_H=20u, SNAKE_CELLS=600u;
const uint SNAKE_BASE=600000u, SNAKE_OCC=SNAKE_BASE+32u;
const uint SNAKE_BODY=SNAKE_OCC+SNAKE_CELLS;
const uint SNAKE_MAGIC=0x534e4b31u;
const uint SNAKE_READY=0u, SNAKE_RUNNING=1u, SNAKE_PAUSED=2u;
const uint SNAKE_DEAD=3u, SNAKE_WON=4u;
const uint SM_MAGIC=0u, SM_STATUS=1u, SM_HEAD=2u, SM_TAIL=3u;
const uint SM_LENGTH=4u, SM_DIRECTION=5u, SM_QUEUED=6u, SM_TURN_LOCK=7u;
const uint SM_FOOD=8u, SM_SCORE=9u, SM_BEST=10u, SM_CREDIT=11u;
const uint SM_RNG=12u, SM_CONNECTED=13u, SM_PAUSE_REASON=14u;
uint snakeWord(uint field){return c.atlas[SNAKE_BASE+field];}
uint snakeStatus(){return snakeWord(SM_STATUS);}
uint snakeScore(){return snakeWord(SM_SCORE);}
uint snakeBest(){return snakeWord(SM_BEST);}
uint snakeLength(){return snakeWord(SM_LENGTH);}
// Directions are clockwise: 0 right, 1 down, 2 left, 3 up.
uint snakeDirection(){return snakeWord(SM_DIRECTION);}
uint snakeHeadCell(){return c.atlas[SNAKE_BODY+snakeWord(SM_HEAD)];}
uint snakeFoodCell(){return snakeWord(SM_FOOD);}
bool snakeConnected(){return snakeWord(SM_CONNECTED)!=0u;}
uint snakePauseReason(){return snakeWord(SM_PAUSE_REASON);}
uint snakeSpeed(){return 8u+min(snakeScore()/30u,12u);}
bool snakeOccupied(uint x,uint y){return x<SNAKE_W&&y<SNAKE_H&&c.atlas[SNAKE_OCC+y*SNAKE_W+x]!=0u;}
bool snakeOccupied(ivec2 p){return p.x>=0&&p.y>=0&&snakeOccupied(uint(p.x),uint(p.y));}
#endif
