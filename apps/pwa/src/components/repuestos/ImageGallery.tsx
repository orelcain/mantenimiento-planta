/**
 * ImageGallery - Galería de imágenes con upload
 * 
 * Características:
 * - Separación visual: imágenes del manual vs fotos reales
 * - Upload drag & drop con preview
 * - Marcar imagen principal
 * - Reordenar imágenes
 * - Eliminar imágenes
 * - Lightbox para ver en grande
 * - Compresión automática (webp)
 */

import React, { useState, useRef } from 'react';
import { useStorage } from '@/hooks/repuestos/useStorage';
import { useCurrentMachine } from '@/contexts/MachineContext';
import type { ImagenRepuesto } from '@/types/repuestos';
import { logger } from '@/lib/logger';

interface ImageGalleryProps {
  repuestoId: string;
  imagenesManual: ImagenRepuesto[];
  fotosReales: ImagenRepuesto[];
  onImageAdded?: () => void;
  onImageDeleted?: () => void;
  readOnly?: boolean;
  className?: string;
}

export function ImageGallery({
  repuestoId,
  imagenesManual,
  fotosReales,
  onImageAdded,
  readOnly = false,
  className = '',
}: ImageGalleryProps) {
  const currentMachine = useCurrentMachine();
  const { uploadImage, uploading } = useStorage(currentMachine?.id || 'baader-200');
  
  const [dragActive, setDragActive] = useState(false);
  const [uploadType, setUploadType] = useState<'manual' | 'real'>('real');
  const [lightboxImage, setLightboxImage] = useState<ImagenRepuesto | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (readOnly) return;

    const files = Array.from(e.dataTransfer.files);
    const imageFiles = files.filter(f => f.type.startsWith('image/'));

    for (const file of imageFiles) {
      await handleUpload(file);
    }
  };

  const handleFileInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || readOnly) return;

    const files = Array.from(e.target.files);
    for (const file of files) {
      await handleUpload(file);
    }

    // Reset input
    e.target.value = '';
  };

  const handleUpload = async (file: File) => {
    try {
      await uploadImage(
        file,
        repuestoId,
        uploadType,
        {
          quality: 85,
          meta: {
            sizeOriginal: file.size,
          }
        }
      );
      
      onImageAdded?.();
    } catch (error) {
      logger.error('Error uploading image', error instanceof Error ? error : new Error(String(error)));
      alert('Error al subir la imagen');
    }
  };

  const renderImageCard = (image: ImagenRepuesto, tipo: 'manual' | 'real') => (
    <div
      key={image.id}
      className="relative group cursor-pointer rounded-lg overflow-hidden border-2 border-gray-200 hover:border-blue-400 transition-all"
      onClick={() => setLightboxImage(image)}
    >
      <img
        src={image.url}
        alt={image.descripcion}
        className="w-full h-40 object-cover"
        loading="lazy"
      />
      
      {/* Overlay con info */}
      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center p-2">
        <p className="text-white text-xs text-center line-clamp-3">
          {image.descripcion}
        </p>
      </div>

      {/* Badge principal */}
      {image.esPrincipal && (
        <div className="absolute top-2 left-2 bg-yellow-500 text-white text-xs font-bold px-2 py-1 rounded">
          ⭐ Principal
        </div>
      )}

      {/* Badge tipo */}
      <div className={`absolute top-2 right-2 text-white text-xs font-bold px-2 py-1 rounded ${
        tipo === 'manual' ? 'bg-purple-500' : 'bg-blue-500'
      }`}>
        {tipo === 'manual' ? '📄 Manual' : '📸 Real'}
      </div>

      {/* Metadata de compresión */}
      {image.formatFinal && (
        <div className="absolute bottom-2 right-2 bg-black/70 text-white text-xs px-2 py-0.5 rounded">
          {image.formatFinal.toUpperCase()} {image.qualityFinal}%
        </div>
      )}
    </div>
  );

  return (
    <div className={className}>
      {/* Upload Zone */}
      {!readOnly && (
        <div className="mb-6">
          <div className="flex gap-2 mb-3">
            <button
              onClick={() => setUploadType('real')}
              className={`flex-1 px-4 py-2 rounded-lg font-medium transition-colors ${
                uploadType === 'real'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              📸 Foto Real
            </button>
            <button
              onClick={() => setUploadType('manual')}
              className={`flex-1 px-4 py-2 rounded-lg font-medium transition-colors ${
                uploadType === 'manual'
                  ? 'bg-purple-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              📄 Del Manual
            </button>
          </div>

          <div
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
              dragActive
                ? 'border-blue-500 bg-blue-50'
                : 'border-gray-300 hover:border-gray-400'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handleFileInput}
              className="hidden"
            />
            
            <div className="text-gray-600">
              <p className="text-lg font-medium mb-2">
                {uploading ? '⏳ Subiendo...' : '📤 Arrastra imágenes aquí'}
              </p>
              <p className="text-sm mb-4">o</p>
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 transition-colors"
              >
                Seleccionar archivos
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Fotos Reales */}
      {fotosReales.length > 0 && (
        <div className="mb-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-3">
            📸 Fotos Reales ({fotosReales.length})
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {fotosReales.map(img => renderImageCard(img, 'real'))}
          </div>
        </div>
      )}

      {/* Imágenes del Manual */}
      {imagenesManual.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold text-gray-800 mb-3">
            📄 Del Manual ({imagenesManual.length})
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {imagenesManual.map(img => renderImageCard(img, 'manual'))}
          </div>
        </div>
      )}

      {/* Sin imágenes */}
      {fotosReales.length === 0 && imagenesManual.length === 0 && (
        <div className="text-center py-12 text-gray-400">
          <p className="text-lg">📷 Sin imágenes</p>
          <p className="text-sm mt-2">Agrega fotos del repuesto o capturas del manual</p>
        </div>
      )}

      {/* Lightbox */}
      {lightboxImage && (
        <div
          className="fixed inset-0 bg-black/90 z-[60] flex items-center justify-center p-4"
          onClick={() => setLightboxImage(null)}
        >
          <div className="max-w-4xl max-h-full">
            <img
              src={lightboxImage.url}
              alt={lightboxImage.descripcion}
              className="max-w-full max-h-[90vh] object-contain"
            />
            <p className="text-white text-center mt-4">
              {lightboxImage.descripcion}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
