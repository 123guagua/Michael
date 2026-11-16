(() => {
const QR_BLOCKS = {
  1:{total:26,data:19,ecc:7,align:[]},
  2:{total:44,data:34,ecc:10,align:[6,18]},
  3:{total:70,data:55,ecc:15,align:[6,22]},
  4:{total:100,data:80,ecc:20,align:[6,26]},
  5:{total:134,data:108,ecc:26,align:[6,30]}
};
function gfMul(x,y){
  let z=0;
  for(let i=7;i>=0;i--){z=(z<<1)^((z>>>7)*0x11D);z^=((y>>>i)&1)*x;}
  return z;
}
function polyMul(a,b){
  const out=new Array(a.length+b.length-1).fill(0);
  for(let i=0;i<a.length;i++)for(let j=0;j<b.length;j++)out[i+j]^=gfMul(a[i],b[j]);
  return out;
}
function rsRemainder(data,degree){
  let gen=[1],root=1;
  for(let i=0;i<degree;i++){gen=polyMul(gen,[1,root]);root=gfMul(root,2);}
  const work=data.concat(new Array(degree).fill(0));
  for(let i=0;i<data.length;i++){
    const factor=work[i];
    if(factor)for(let j=0;j<gen.length;j++)work[i+j]^=gfMul(gen[j],factor);
  }
  return work.slice(data.length);
}
function putBits(bits,value,len){for(let i=len-1;i>=0;i--)bits.push((value>>>i)&1);}
function bch(value,poly,shift){
  let v=value<<shift, degree=31-Math.clz32(poly);
  while(v && 31-Math.clz32(v)>=degree)v^=poly<<((31-Math.clz32(v))-degree);
  return v;
}
function qrMatrix(text){
  const bytes=Array.from(new TextEncoder().encode(text));
  let version=1;
  while(version<=5 && 4+8+bytes.length*8>QR_BLOCKS[version].data*8)version++;
  if(version>5)throw new Error("代理 URI 太长，当前版本二维码无法容纳。");
  const spec=QR_BLOCKS[version],bits=[];
  putBits(bits,4,4);putBits(bits,bytes.length,8);
  bytes.forEach(b=>putBits(bits,b,8));
  const cap=spec.data*8;
  for(let i=0;i<Math.min(4,cap-bits.length);i++)bits.push(0);
  while(bits.length%8)bits.push(0);
  const data=[];
  for(let i=0;i<bits.length;i+=8){let v=0;for(let j=0;j<8;j++)v=(v<<1)|bits[i+j];data.push(v);}
  let pad=0;while(data.length<spec.data)data.push(pad++%2===0?0xEC:0x11);
  const codewords=data.concat(rsRemainder(data,spec.ecc));
  const n=version*4+17,m=Array.from({length:n},()=>Array(n).fill(null));
  function finder(top,left){
    for(let dy=-1;dy<=7;dy++)for(let dx=-1;dx<=7;dx++){
      const r=top+dy,c=left+dx;if(r<0||r>=n||c<0||c>=n)continue;
      const inside=dy>=0&&dy<=6&&dx>=0&&dx<=6;
      m[r][c]=!!(inside&&(dy===0||dy===6||dx===0||dx===6||(dy>=2&&dy<=4&&dx>=2&&dx<=4)));
    }
  }
  finder(0,0);finder(0,n-7);finder(n-7,0);
  for(let i=8;i<n-8;i++){
    if(m[6][i]===null)m[6][i]=i%2===0;
    if(m[i][6]===null)m[i][6]=i%2===0;
  }
  for(const r of spec.align)for(const c of spec.align){
    if(m[r][c]!==null)continue;
    for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++)
      m[r+dy][c+dx]=Math.max(Math.abs(dx),Math.abs(dy))!==1;
  }
  const fA=[[0,8],[1,8],[2,8],[3,8],[4,8],[5,8],[7,8],[8,8],[8,7],[8,5],[8,4],[8,3],[8,2],[8,1],[8,0]];
  const fB=[];for(let i=0;i<8;i++)fB.push([8,n-1-i]);for(let i=8;i<15;i++)fB.push([n-15+i,8]);
  fA.concat(fB).forEach(([r,c])=>m[r][c]=false);
  m[n-8][8]=true;
  let bit=0,row=n-1,dir=-1;
  for(let right=n-1;right>=1;right-=2){
    if(right===6)right--;
    while(true){
      for(let j=0;j<2;j++){
        const c=right-j;
        if(m[row][c]===null){
          let dark=bit<codewords.length*8?((codewords[bit>>>3]>>>(7-(bit&7)))&1)!==0:false;
          if((row+c)%2===0)dark=!dark;
          m[row][c]=dark;bit++;
        }
      }
      row+=dir;
      if(row<0||row>=n){row-=dir;dir=-dir;break;}
    }
  }
  const formatData=8; // level L (01), mask 0
  const formatBits=((formatData<<10)|bch(formatData,0x537,10))^0x5412;
  for(let i=0;i<15;i++){
    const v=((formatBits>>>i)&1)!==0;
    m[fA[i][0]][fA[i][1]]=v;m[fB[i][0]][fB[i][1]]=v;
  }
  return m;
}

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('canvas[data-qr]').forEach((canvas) => {
    const value = canvas.dataset.qr || '';
    try {
      const matrix = qrMatrix(value);
      const scale = Math.max(1, Math.floor(144 / (matrix.length + 8)));
      canvas.width = canvas.height = (matrix.length + 8) * scale;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#111827';
      matrix.forEach((row, y) => row.forEach((dark, x) => {
        if (dark) ctx.fillRect((x + 4) * scale, (y + 4) * scale, scale, scale);
      }));
    } catch {
      const note = document.createElement('span');
      note.className = 'qr-error';
      note.textContent = '二维码暂不可用';
      canvas.replaceWith(note);
    }
  });

  document.querySelectorAll('[data-copy]').forEach((button) => {
    button.addEventListener('click', async () => {
      const text = button.dataset.copy || '';
      try {
        await navigator.clipboard.writeText(text);
        const old = button.textContent;
        button.textContent = '已复制';
        setTimeout(() => { button.textContent = old; }, 1400);
      } catch {
        window.prompt('复制以下代理地址：', text);
      }
    });
  });
});

})();
