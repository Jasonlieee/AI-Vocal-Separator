
# AI人声伴奏分离器 MVP

本地离线运行的 AI 音频分离工具，支持将音频文件分离为人声（含和声）和纯器乐伴奏两轨。

## 🎯 技术方案说明

### 为什么选择 Demucs？

经过研究对比，**Demucs (Hybrid Transformer / Demucs v4)** 是目前最先进的开源音频分离方案：

| 特性 | Demucs | Spleeter | UVR-MDX-Net |
|------|--------|----------|-------------|
| 分离质量 SDR | 9.0 dB | 5.9 dB | ~7.0 dB |
| 架构 | 混合时域/频域 Transformer | 纯频域 U-Net | 频域 U-Net |
| 人声纯净度 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ |
| 低音清晰度 | ⭐⭐⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐ |
| 相位完整性 | 完美保留 | 丢失 | 部分保留 |

### Demucs 技术原理

1. **双 U-Net 架构**：
   - 一个分支在**时域**处理原始波形，保留相位信息
   - 另一个分支在**频域**处理频谱图，利用频率特征

2. **跨域 Transformer**：
   - 在编码器和解码器之间使用注意力机制
   - 有效融合时域和频域的互补信息

3. **自注意力机制**：
   - 每个域内的自注意力理解上下文关系
   - 跨域的交叉注意力实现信息融合

## 🚀 快速开始

### 环境要求

- Python 3.8 - 3.11（重要：Demucs 暂不支持 Python 3.12+）
- 4GB 以上内存
- 至少 2GB 可用磁盘空间（用于存放 AI 模型）

### 1. 创建虚拟环境（推荐）

```bash
python -m venv venv

# Windows
venv\Scripts\activate

# macOS/Linux
source venv/bin/activate
```

### 2. 安装依赖

```bash
pip install -r requirements.txt
```

**注意：如果 Demucs 安装失败，请尝试：**

```bash
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cpu
pip install demucs
pip install fastapi uvicorn python-multipart soundfile
```

### 3. 启动服务

```bash
python app.py
```

服务将在 `http://localhost:8001` 启动

### 4. 打开网页

在浏览器中访问: `http://localhost:8001`

## ✨ 功能特性

### 核心功能

- ✅ **高质量 Demucs 分离** - 业内领先的分离效果
- ✅ **双轨波形可视化** - 直观的音频波形展示
- ✅ **可拖动时间轴** - 精确的播放位置控制
- ✅ **同步双轨播放** - 人声和伴奏完美同步
- ✅ **独立音量控制** - 每个轨道可单独调节音量
- ✅ **静音/独奏** - 快速切换监听模式
- ✅ **文件下载** - 支持单轨或全部导出
- ✅ **前进/后退** - 快捷的时间跳转

### 用户体验

- 🎨 **美观的黑色主题** - 专业的音频制作风格
- ✨ **星空背景效果** - 优雅的视觉体验
- 📱 **响应式设计** - 适配各种屏幕尺寸
- 🖱️ **拖拽上传** - 支持点击和拖拽两种上传方式

## 📁 项目结构

```
.
├── app.py              # FastAPI 后端（集成 Demucs）
├── app_simple.py       # 简化版后端（无 AI，仅用于演示）
├── index.html          # 前端页面（完整功能）
├── requirements.txt    # Python 依赖
├── README.md           # 说明文档
├── temp/               # 临时文件目录（自动创建）
├── static/             # 分离结果目录（自动创建）
└── output/             # AI 分离输出目录（自动创建）
```

## 🔧 使用说明

### 基本使用流程

1. **上传音频** - 点击上传区域或拖拽音频文件
2. **开始分离** - 点击"分离音频"按钮
3. **等待处理** - 首次运行会自动下载 Demucs 模型（~200MB）
4. **试听效果** - 在播放器中试听分离结果
5. **导出文件** - 下载需要的轨道

### 播放器控制说明

| 按钮 | 功能 |
|------|------|
| ⏮️ | 后退 10 秒 |
| ⏹️ | 停止播放并回到开头 |
| ▶️ | 播放/继续播放 |
| ⏸️ | 暂停播放 |
| ⏭️ | 前进 10 秒 |
| M | 静音/取消静音轨道 |
| S | 独奏/取消独奏轨道 |
| ⬇️ | 下载当前轨道 |

## ⚙️ 高级配置

### 更换 Demucs 模型（可选）

默认使用 `htdemucs` 模型。如需使用其他模型，修改 `app.py`：

```python
model = pretrained.get_model('htdemucs')  # 更换为 'htdemucs_ft', 'mdx_extra', 等
```

可选模型列表：
- `htdemucs` - 平衡版本（推荐）
- `htdemucs_ft` - 精细调优版本（更高质量）
- `mdx_extra` - UVR-MDX 模型

## 🔍 故障排除

### Python 版本问题

如果使用的是 Python 3.12 或更高版本，请安装 Python 3.10 或 3.11：

```bash
# 使用 pyenv（推荐）
pyenv install 3.10.11
pyenv local 3.10.11

# 或使用 conda
conda create -n audio-sep python=3.10
conda activate audio-sep
```

### Demucs 安装失败

尝试安装特定版本的 PyTorch：

```bash
# CPU 版本
pip install torch==2.0.1 torchvision==0.15.2 torchaudio==2.0.2 --index-url https://download.pytorch.org/whl/cpu

# CUDA 11.8 版本（如需 GPU 加速）
pip install torch==2.0.1 torchvision==0.15.2 torchaudio==2.0.2 --index-url https://download.pytorch.org/whl/cu118
```

### 端口被占用

如果 8001 端口被占用，修改 `app.py` 最后一行的端口号：

```python
uvicorn.run(app, host='0.0.0.0', port=8080)  # 改为其他端口
```

### 波形不显示

确保浏览器支持 Web Audio API。现代浏览器（Chrome、Firefox、Edge、Safari）都支持。

## 📖 技术栈

- **后端**：FastAPI + Demucs + PyTorch
- **前端**：原生 HTML/CSS/JavaScript + Web Audio API + Canvas
- **AI 模型**：Demucs (Hybrid Transformer/Demucs v4)

## 📄 许可证

MIT License
