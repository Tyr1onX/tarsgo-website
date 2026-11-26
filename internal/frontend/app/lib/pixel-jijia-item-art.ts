// All item pixels use the same outline and upper-left light as the campus props.
export type ItemSprite = { color: string; pixels: string[]; palette?:Record<string,string> };

export function drawItem(ctx:CanvasRenderingContext2D, sprite:ItemSprite, x:number, y:number, scale=1) {
  const palette:Record<string,string>={x:"#39454a", a:"#e4d8ae", b:sprite.color, "@":"#293641",...sprite.palette};
  const width=Math.max(...sprite.pixels.map(row=>row.length));
  const left=Math.round(x-width*scale/2), top=Math.round(y-sprite.pixels.length*scale/2);
  for (const [rowIndex,row] of sprite.pixels.entries()) {
    for(let col=0;col<row.length;col++){
      const color=palette[row[col]];
      if(color){ctx.fillStyle=color;ctx.fillRect(left+col*scale,top+rowIndex*scale,scale,scale);}
    }
  }
}
