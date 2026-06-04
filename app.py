
import os
import shutil
import uuid
import subprocess
import json
import time
import numpy as np
import torch
import soundfile as sf
from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
import threading

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

TEMP_DIR = "temp"
STATIC_DIR = "static"
LIBRARY_FILE = "library.json"

os.makedirs(TEMP_DIR, exist_ok=True)
os.makedirs(STATIC_DIR, exist_ok=True)

lock = threading.Lock()

def load_library():
    if os.path.exists(LIBRARY_FILE):
        try:
            with open(LIBRARY_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
        except:
            return []
    return []

def save_library(data):
    with open(LIBRARY_FILE, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

class LibraryItem(BaseModel):
    name: str
    vocals_url: str
    drums_url: str
    bass_url: str
    other_url: str

model = None
device = None
ffmpeg_path = None

# 音质提升模型（使用 noisereduce）
enhance_available = False

def find_ffmpeg():
    global ffmpeg_path
    try:
        import imageio_ffmpeg
        ffmpeg_path = imageio_ffmpeg.get_ffmpeg_exe()
        print(f"找到 ffmpeg: {ffmpeg_path}")
        return True
    except ImportError:
        print("未找到 imageio-ffmpeg，尝试系统 ffmpeg...")
        ffmpeg_path = shutil.which("ffmpeg")
        if ffmpeg_path:
            print(f"找到系统 ffmpeg: {ffmpeg_path}")
            return True
        print("[ERROR] 未找到任何 ffmpeg!")
        return False

def load_model():
    global model, device
    try:
        print("正在加载 Demucs 模型...")
        from demucs import pretrained
        device = "cuda" if torch.cuda.is_available() else "cpu"
        print(f"使用设备: {device}")
        model = pretrained.get_model("htdemucs")
        model.to(device)
        model.eval()
        print(f"[OK] Demucs 模型加载成功!")
        print(f"   模型采样率: {model.samplerate}")
        print(f"   源: {model.sources}")
        return True
    except Exception as e:
        print(f"[ERROR] 模型加载失败: {e}")
        import traceback
        traceback.print_exc()
        return False

def load_enhance_model():
    """加载音质提升模型（使用 noisereduce）"""
    global enhance_available
    try:
        print("正在加载音质提升模块...")
        import noisereduce as nr
        enhance_available = True
        print(f"[OK] noisereduce 模块加载成功!")
        return True
    except Exception as e:
        print(f"[WARN] 音质提升模块加载失败: {e}")
        print("   音质提升功能将不可用")
        import traceback
        traceback.print_exc()
        return False

find_ffmpeg()
load_model()
load_enhance_model()

def clear_directory(directory):
    for filename in os.listdir(directory):
        file_path = os.path.join(directory, filename)
        try:
            if os.path.isfile(file_path) or os.path.islink(file_path):
                os.unlink(file_path)
            elif os.path.isdir(file_path):
                shutil.rmtree(file_path)
        except Exception as e:
            print(f"无法删除 {file_path}: {e}")

clear_directory(TEMP_DIR)
clear_directory(STATIC_DIR)

@app.get("/")
async def read_root():
    return FileResponse("index.html")

@app.get("/styles.css")
async def read_styles():
    return FileResponse("styles.css", media_type="text/css")

@app.get("/app.js")
async def read_scripts():
    return FileResponse("app.js", media_type="application/javascript")

def convert_to_wav(input_path):
    if input_path.lower().endswith('.wav'):
        return input_path
    wav_path = input_path + ".wav"
    cmd = [ffmpeg_path, "-y", "-i", input_path, "-ar", "44100", "-ac", "2", wav_path]
    print(f"转换命令: {' '.join(cmd)}")
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
    if result.returncode != 0:
        print(f"ffmpeg 错误: {result.stderr}")
        raise RuntimeError(f"ffmpeg 转换失败: {result.stderr[:200]}")
    print(f"转换成功: {wav_path}")
    return wav_path

def load_audio(wav_path, target_sr=44100):
    data, sr = sf.read(wav_path, dtype='float32')
    print(f"读取音频: shape={data.shape}, sr={sr}")
    if data.ndim == 1:
        data = np.stack([data, data], axis=0)
    else:
        data = data.T
    wav = torch.from_numpy(data).float()
    if sr != target_sr:
        wav = torch.nn.functional.interpolate(
            wav.unsqueeze(0), scale_factor=target_sr / sr, mode='linear', align_corners=False
        ).squeeze(0)
    if wav.shape[0] == 1:
        wav = wav.repeat(2, 1)
    if wav.shape[0] > 2:
        wav = wav[:2]
    print(f"最终音频: shape={wav.shape}, sr={target_sr}")
    return wav

def separate_audio_with_demucs(input_path, output_dir):
    try:
        print(f"\n{'='*50}")
        print(f"[START] 开始分离: {input_path}")

        if model is None:
            print("[ERROR] 模型未加载!")
            return None
        if ffmpeg_path is None:
            print("[ERROR] ffmpeg 未找到!")
            return None

        from demucs.apply import apply_model

        print("步骤 1: 转换为 WAV...")
        wav_path = convert_to_wav(input_path)

        print("步骤 2: 加载音频数据...")
        wav = load_audio(wav_path, model.samplerate)

        if wav_path != input_path and os.path.exists(wav_path):
            os.remove(wav_path)

        wav = wav[None]
        print(f"步骤 3: 执行分离 (输入形状: {wav.shape})...")

        with torch.no_grad():
            sources = apply_model(model, wav, device=device, shifts=0, split=True, overlap=0.25)[0]

        print(f"分离结果形状: {sources.shape}")

        print("步骤 4: 保存4个轨道...")
        uid = uuid.uuid4()

        track_names = ['drums', 'bass', 'other', 'vocals']
        track_paths = {}

        for i, name in enumerate(track_names):
            track_path = os.path.join(output_dir, f"{uid}_{name}.wav")
            sf.write(track_path, sources[i].cpu().numpy().T, model.samplerate)
            track_size = os.path.getsize(track_path)
            track_paths[name] = track_path
            print(f"   {name}: {track_path} ({track_size} bytes)")

        print(f"[OK] 分离成功!")
        print(f"{'='*50}\n")

        return {
            'drums': track_paths['drums'],
            'bass': track_paths['bass'],
            'other': track_paths['other'],
            'vocals': track_paths['vocals']
        }

    except Exception as e:
        print(f"[ERROR] 分离失败: {e}")
        import traceback
        traceback.print_exc()
        return None

@app.post("/api/separate")
async def separate_audio_endpoint(file: UploadFile = File(...)):
    if not lock.acquire(blocking=False):
        raise HTTPException(status_code=409, detail="另一个分离任务正在进行中，请稍后再试...")

    try:
        # 支持的输入格式
        supported_input_formats = ['.mp3', '.wav', '.flac', '.ogg', '.aac', '.wma', '.m4a', '.ape', '.alac']
        
        ext = os.path.splitext(file.filename)[1].lower()
        if ext not in supported_input_formats:
            raise HTTPException(status_code=400, detail=f"不支持的输入格式: {ext}，支持的格式: {', '.join(supported_input_formats)}")

        file_id = str(uuid.uuid4())
        temp_file_path = os.path.join(TEMP_DIR, f"{file_id}{ext}")

        with open(temp_file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        file_size = os.path.getsize(temp_file_path)
        print(f"已保存文件: {temp_file_path} ({file_size} bytes)")

        result = separate_audio_with_demucs(temp_file_path, STATIC_DIR)

        if result is None:
            try:
                os.remove(temp_file_path)
            except:
                pass
            raise HTTPException(status_code=500, detail="音频分离失败，请检查服务器日志")

        try:
            os.remove(temp_file_path)
        except:
            pass

        return {
            "status": "success",
            "drums_url": f"/static/{os.path.basename(result['drums'])}",
            "bass_url": f"/static/{os.path.basename(result['bass'])}",
            "other_url": f"/static/{os.path.basename(result['other'])}",
            "vocals_url": f"/static/{os.path.basename(result['vocals'])}"
        }

    except HTTPException:
        raise
    except Exception as e:
        print(f"[ERROR] 请求处理异常: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        lock.release()

def convert_audio_format(input_path, output_format, output_dir):
    """转换音频格式的核心函数"""
    try:
        print(f"\n{'='*50}")
        print(f"[CONVERT] 开始格式转换: {input_path} -> {output_format}")

        if ffmpeg_path is None:
            print("[ERROR] ffmpeg 未找到!")
            return None

        uid = uuid.uuid4()
        output_path = os.path.join(output_dir, f"{uid}.{output_format}")

        # 根据输出格式设置不同的参数
        if output_format == "mp3":
            cmd = [ffmpeg_path, "-y", "-i", input_path, "-codec:a", "libmp3lame", "-b:a", "320k", output_path]
        elif output_format == "wav":
            cmd = [ffmpeg_path, "-y", "-i", input_path, "-ar", "44100", "-ac", "2", output_path]
        elif output_format == "flac":
            cmd = [ffmpeg_path, "-y", "-i", input_path, "-codec:a", "flac", output_path]
        elif output_format == "ogg":
            cmd = [ffmpeg_path, "-y", "-i", input_path, "-codec:a", "libvorbis", "-b:a", "320k", output_path]
        elif output_format == "aac":
            cmd = [ffmpeg_path, "-y", "-i", input_path, "-codec:a", "aac", "-b:a", "256k", output_path]
        elif output_format == "wma":
            cmd = [ffmpeg_path, "-y", "-i", input_path, "-codec:a", "wmav2", "-b:a", "320k", output_path]
        else:
            print(f"[ERROR] 不支持的输出格式: {output_format}")
            return None

        print(f"转换命令: {' '.join(cmd)}")
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)

        if result.returncode != 0:
            print(f"ffmpeg 错误: {result.stderr}")
            raise RuntimeError(f"格式转换失败: {result.stderr[:200]}")

        if os.path.exists(output_path) and os.path.getsize(output_path) > 0:
            output_size = os.path.getsize(output_path)
            print(f"[OK] 转换成功!")
            print(f"   输出文件: {output_path} ({output_size} bytes)")
            print(f"{'='*50}\n")
            return output_path
        else:
            print("[ERROR] 转换后的文件为空或不存在")
            return None

    except Exception as e:
        print(f"[ERROR] 格式转换失败: {e}")
        import traceback
        traceback.print_exc()
        return None

@app.post("/api/convert")
async def convert_audio_endpoint(file: UploadFile = File(...), output_format: str = "mp3"):
    """音频格式转换API"""
    try:
        # 支持的输入格式
        supported_input_formats = ['.mp3', '.wav', '.flac', '.ogg', '.aac', '.wma', '.m4a', '.ape', '.alac']
        
        ext = os.path.splitext(file.filename)[1].lower()
        if ext not in supported_input_formats:
            raise HTTPException(status_code=400, detail=f"不支持的输入格式: {ext}，支持的格式: {', '.join(supported_input_formats)}")

        # 支持的输出格式
        supported_output_formats = ['mp3', 'wav', 'flac', 'ogg', 'aac', 'wma']
        if output_format not in supported_output_formats:
            raise HTTPException(status_code=400, detail=f"不支持的输出格式: {output_format}，支持的格式: {', '.join(supported_output_formats)}")

        file_id = str(uuid.uuid4())
        temp_file_path = os.path.join(TEMP_DIR, f"{file_id}{ext}")

        with open(temp_file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        file_size = os.path.getsize(temp_file_path)
        print(f"已保存文件: {temp_file_path} ({file_size} bytes)")

        converted_path = convert_audio_format(temp_file_path, output_format, STATIC_DIR)

        if converted_path is None:
            try:
                os.remove(temp_file_path)
            except:
                pass
            raise HTTPException(status_code=500, detail="音频格式转换失败，请检查服务器日志")

        try:
            os.remove(temp_file_path)
        except:
            pass

        return {
            "status": "success",
            "converted_url": f"/static/{os.path.basename(converted_path)}",
            "original_format": ext[1:],
            "output_format": output_format,
            "file_size": os.path.getsize(converted_path)
        }

    except HTTPException:
        raise
    except Exception as e:
        print(f"[ERROR] 格式转换请求处理异常: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/convert-and-separate")
async def convert_and_separate_endpoint(file: UploadFile = File(...), output_format: str = "mp3"):
    """先转换格式，再进行音频分离"""
    if not lock.acquire(blocking=False):
        raise HTTPException(status_code=409, detail="另一个分离任务正在进行中，请稍后再试...")

    try:
        # 支持的输入格式
        supported_input_formats = ['.mp3', '.wav', '.flac', '.ogg', '.aac', '.wma', '.m4a', '.ape', '.alac']
        
        ext = os.path.splitext(file.filename)[1].lower()
        if ext not in supported_input_formats:
            raise HTTPException(status_code=400, detail=f"不支持的输入格式: {ext}，支持的格式: {', '.join(supported_input_formats)}")

        file_id = str(uuid.uuid4())
        temp_file_path = os.path.join(TEMP_DIR, f"{file_id}{ext}")

        with open(temp_file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        file_size = os.path.getsize(temp_file_path)
        print(f"已保存文件: {temp_file_path} ({file_size} bytes)")

        # 先转换格式
        print("步骤1: 转换音频格式...")
        converted_path = convert_audio_format(temp_file_path, output_format, TEMP_DIR)

        if converted_path is None:
            try:
                os.remove(temp_file_path)
            except:
                pass
            raise HTTPException(status_code=500, detail="音频格式转换失败")

        # 再进行分离
        print("步骤2: 进行音频分离...")
        result = separate_audio_with_demucs(converted_path, STATIC_DIR)

        # 清理临时文件
        try:
            os.remove(temp_file_path)
        except:
            pass
        try:
            os.remove(converted_path)
        except:
            pass

        if result is None:
            raise HTTPException(status_code=500, detail="音频分离失败，请检查服务器日志")

        return {
            "status": "success",
            "drums_url": f"/static/{os.path.basename(result['drums'])}",
            "bass_url": f"/static/{os.path.basename(result['bass'])}",
            "other_url": f"/static/{os.path.basename(result['other'])}",
            "vocals_url": f"/static/{os.path.basename(result['vocals'])}",
            "converted_format": output_format
        }

    except HTTPException:
        raise
    except Exception as e:
        print(f"[ERROR] 转换和分离请求处理异常: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        lock.release()

@app.post("/api/batch-separate")
async def batch_separate_endpoint(file: UploadFile = File(...)):
    if not lock.acquire(blocking=False):
        raise HTTPException(status_code=409, detail="另一个分离任务正在进行中，请稍后再试...")

    try:
        supported_input_formats = ['.mp3', '.wav', '.flac', '.ogg', '.aac', '.wma', '.m4a', '.ape', '.alac']
        
        ext = os.path.splitext(file.filename)[1].lower()
        if ext not in supported_input_formats:
            raise HTTPException(status_code=400, detail=f"不支持的输入格式: {ext}")

        file_id = str(uuid.uuid4())
        temp_file_path = os.path.join(TEMP_DIR, f"{file_id}{ext}")

        with open(temp_file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        result = separate_audio_with_demucs(temp_file_path, STATIC_DIR)

        try:
            os.remove(temp_file_path)
        except:
            pass

        if result is None:
            raise HTTPException(status_code=500, detail="音频分离失败")

        return {
            "status": "success",
            "drums_url": f"/static/{os.path.basename(result['drums'])}",
            "bass_url": f"/static/{os.path.basename(result['bass'])}",
            "other_url": f"/static/{os.path.basename(result['other'])}",
            "vocals_url": f"/static/{os.path.basename(result['vocals'])}"
        }

    except HTTPException:
        raise
    except Exception as e:
        print(f"[ERROR] 批量分离请求处理异常: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        lock.release()

@app.get("/api/files")
async def list_files():
    files = []
    if os.path.exists(STATIC_DIR):
        for filename in os.listdir(STATIC_DIR):
            filepath = os.path.join(STATIC_DIR, filename)
            if os.path.isfile(filepath):
                stat = os.stat(filepath)
                files.append({
                    "name": filename,
                    "size": stat.st_size,
                    "modified": stat.st_mtime
                })
    files.sort(key=lambda x: x["modified"], reverse=True)
    return {"files": files}

@app.delete("/api/files/{filename}")
async def delete_file(filename: str):
    filepath = os.path.join(STATIC_DIR, filename)
    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail="文件不存在")
    try:
        os.remove(filepath)
        return {"status": "success", "message": f"已删除 {filename}"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"删除失败: {str(e)}")

@app.delete("/api/files")
async def delete_all_files():
    deleted = 0
    if os.path.exists(STATIC_DIR):
        for filename in os.listdir(STATIC_DIR):
            filepath = os.path.join(STATIC_DIR, filename)
            if os.path.isfile(filepath):
                try:
                    os.remove(filepath)
                    deleted += 1
                except:
                    pass
    return {"status": "success", "deleted": deleted}

@app.get("/api/library")
async def get_library():
    items = load_library()
    return {"items": items}

@app.post("/api/library")
async def add_to_library(item: LibraryItem):
    items = load_library()
    new_item = {
        "id": str(uuid.uuid4()),
        "name": item.name,
        "vocals_url": item.vocals_url,
        "drums_url": item.drums_url,
        "bass_url": item.bass_url,
        "other_url": item.other_url,
        "created_at": time.time()
    }
    items.append(new_item)
    save_library(items)
    return {"status": "success", "item": new_item}

@app.delete("/api/library/{item_id}")
async def delete_library_item(item_id: str):
    items = load_library()
    items = [item for item in items if item.get("id") != item_id]
    save_library(items)
    return {"status": "success"}

def enhance_audio_with_noisereduce(input_path, output_dir):
    """使用 noisereduce 提升音质（逐声道处理避免内存溢出）"""
    try:
        print(f"\n{'='*50}")
        print(f"[ENHANCE] 开始音质提升: {input_path}")

        if not enhance_available:
            print("[ERROR] 音质提升模块未加载!")
            return None

        import noisereduce as nr

        # 使用 soundfile 加载音频
        print("步骤 1: 加载音频...")
        audio_np, sr = sf.read(input_path, dtype='float32')
        print(f"   原始采样率: {sr}, 形状: {audio_np.shape}")

        # soundfile 返回 (samples,) 或 (samples, channels) 格式
        is_mono = audio_np.ndim == 1
        if is_mono:
            audio_np = audio_np.reshape(-1, 1)

        num_channels = audio_np.shape[1]
        print(f"   声道数: {num_channels}")

        print(f"步骤 2: 执行降噪处理...")

        # 逐声道处理，避免内存溢出
        enhanced_channels = []
        for ch in range(num_channels):
            print(f"   处理声道 {ch + 1}/{num_channels}...")
            channel_data = audio_np[:, ch]
            reduced = nr.reduce_noise(
                y=channel_data,
                sr=sr,
                stationary=False,
                prop_decrease=0.75,
                freq_mask_smooth_hz=500,
                time_mask_smooth_ms=50,
                thresh_n_mult_nonstationary=2,
                sigmoid_slope_nonstationary=10,
                n_std_thresh_stationary=1.5,
            )
            enhanced_channels.append(reduced)

        # 合并声道
        if is_mono:
            enhanced_audio = enhanced_channels[0]
        else:
            enhanced_audio = np.column_stack(enhanced_channels)

        print(f"   输出形状: {enhanced_audio.shape}")

        # 保存结果
        uid = uuid.uuid4()
        output_path = os.path.join(output_dir, f"{uid}_enhanced.wav")
        sf.write(output_path, enhanced_audio, sr)

        output_size = os.path.getsize(output_path)
        print(f"[OK] 音质提升成功!")
        print(f"   输出文件: {output_path} ({output_size} bytes)")
        print(f"{'='*50}\n")

        return output_path

    except Exception as e:
        print(f"[ERROR] 音质提升失败: {e}")
        import traceback
        traceback.print_exc()
        return None

@app.post("/api/enhance")
async def enhance_audio_endpoint(file: UploadFile = File(...)):
    """音质提升 API 接口"""
    if not lock.acquire(blocking=False):
        raise HTTPException(status_code=409, detail="另一个任务正在进行中，请稍后再试...")

    try:
        # 检查模型是否加载
        if not enhance_available:
            raise HTTPException(status_code=503, detail="音质提升模块未加载，请检查服务器日志")

        # 支持的输入格式
        supported_input_formats = ['.mp3', '.wav', '.flac', '.ogg', '.aac', '.wma', '.m4a', '.ape', '.alac']
        
        ext = os.path.splitext(file.filename)[1].lower()
        if ext not in supported_input_formats:
            raise HTTPException(status_code=400, detail=f"不支持的输入格式: {ext}，支持的格式: {', '.join(supported_input_formats)}")

        file_id = str(uuid.uuid4())
        temp_file_path = os.path.join(TEMP_DIR, f"{file_id}{ext}")

        with open(temp_file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        file_size = os.path.getsize(temp_file_path)
        print(f"已保存文件: {temp_file_path} ({file_size} bytes)")

        # 保存原始文件到 static 目录
        original_path = os.path.join(STATIC_DIR, f"{file_id}_original{ext}")
        shutil.copy2(temp_file_path, original_path)

        result = enhance_audio_with_noisereduce(temp_file_path, STATIC_DIR)

        # 清理临时文件
        try:
            os.remove(temp_file_path)
        except:
            pass

        if result is None:
            raise HTTPException(status_code=500, detail="音质提升失败，请检查服务器日志")

        return {
            "status": "success",
            "original_url": f"/static/{os.path.basename(original_path)}",
            "enhanced_url": f"/static/{os.path.basename(result)}",
            "file_id": file_id,
            "original_filename": file.filename
        }

    except HTTPException:
        raise
    except Exception as e:
        print(f"[ERROR] 请求处理异常: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        lock.release()

app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

if __name__ == "__main__":
    import uvicorn
    print("[SERVER] 启动服务器...")
    uvicorn.run(app, host="0.0.0.0", port=9000)
