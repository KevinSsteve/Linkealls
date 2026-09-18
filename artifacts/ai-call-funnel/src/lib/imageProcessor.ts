export async function processAnalysisImage(file: File): Promise<{ base64: string; mimeType: "image/jpeg"; objectUrl: string; size: number }> {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    throw new Error("Formato não suportado. Escolhe JPG, PNG ou WEBP.");
  }
  if (file.size > 10 * 1024 * 1024) {
    throw new Error("A imagem é demasiado grande. O máximo é 10 MB.");
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      const img = new Image();
      
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let width = img.width;
        let height = img.height;
        const max = 1600;

        if (width > max || height > max) {
          if (width > height) {
            height = Math.round((height * max) / width);
            width = max;
          } else {
            width = Math.round((width * max) / height);
            height = max;
          }
        }

        canvas.width = width;
        canvas.height = height;
        
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          return reject(new Error("Erro ao processar a imagem no navegador."));
        }
        
        // Fill white background for transparent PNGs converted to JPEG
        ctx.fillStyle = "#FFFFFF";
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);

        const mimeType = "image/jpeg";
        let quality = 0.9;
        let dataUrl = canvas.toDataURL(mimeType, quality);
        
        // Target <= 3MB in base64 string length
        const maxStringLength = 3.5 * 1024 * 1024;
        
        while (dataUrl.length > maxStringLength && quality > 0.1) {
          quality -= 0.1;
          dataUrl = canvas.toDataURL(mimeType, quality);
        }
        
        if (dataUrl.length > maxStringLength) {
          return reject(new Error("Não foi possível reduzir a imagem o suficiente. Tenta cortar ou usar outra foto."));
        }

        canvas.toBlob((blob) => {
          if (!blob) return reject(new Error("Erro ao gerar a visualização."));
          resolve({
            base64: dataUrl.split(",")[1], // Strip the data URL prefix
            mimeType,
            objectUrl: URL.createObjectURL(blob),
            size: blob.size,
          });
        }, mimeType, quality);
      };
      
      img.onerror = () => reject(new Error("Ficheiro de imagem inválido ou corrompido."));
      
      if (typeof e.target?.result === "string") {
        img.src = e.target.result;
      } else {
        reject(new Error("Erro ao ler o ficheiro no navegador."));
      }
    };
    
    reader.onerror = () => reject(new Error("Erro ao aceder à imagem."));
    reader.readAsDataURL(file);
  });
}
