"""Small local chime; no network, audio package or external asset needed."""
import math
import os
import struct
import wave

class OrderSound:
    def __init__(self,root,directory):
        self.root=root;self.path=directory/'siparis-bildirimi-v1.wav'

    def play(self):
        if os.name!='nt':
            self.root.bell();return
        import winsound
        if not self.path.exists():
            frames=[];rate=22050
            for frequency in (784,1047):
                duration=.19
                for index in range(int(rate*duration)):
                    envelope=min(1,index/(rate*.015))*max(0,1-index/(rate*duration))
                    frames.append(struct.pack('<h',int(12000*envelope*math.sin(2*math.pi*frequency*index/rate))))
                frames.extend([b'\x00\x00']*int(rate*.045))
            with wave.open(str(self.path),'wb') as output:
                output.setnchannels(1);output.setsampwidth(2);output.setframerate(rate);output.writeframes(b''.join(frames))
        winsound.PlaySound(str(self.path),winsound.SND_FILENAME|winsound.SND_ASYNC|winsound.SND_NODEFAULT)

    def stop(self):
        if os.name=='nt':
            import winsound
            winsound.PlaySound(None,0)
