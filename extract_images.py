import os
import win32com.client
import pythoncom


def extract_images_from_doc(doc_path, output_dir=None):
    """
    Извлекает все изображения из .doc файла.
    Использует несколько методов для разных типов изображений.
    """
    if output_dir is None:
        output_dir = os.path.dirname(doc_path)

    # Папка для картинок
    img_folder = os.path.join(output_dir, "images")
    os.makedirs(img_folder, exist_ok=True)

    print(f"🔍 Поиск изображений в {os.path.basename(doc_path)}...")

    word = None
    try:
        # Инициализация COM
        pythoncom.CoInitialize()

        word = win32com.client.Dispatch("Word.Application")
        word.Visible = False
        word.DisplayAlerts = 0

        abs_path = os.path.abspath(doc_path)
        doc = word.Documents.Open(abs_path)

        saved_count = 0
        saved_files = []

        # МЕТОД 1: Пробуем сохранить документ как HTML (извлечёт все картинки)
        print("📄 Попытка извлечения через HTML...")
        try:
            html_path = os.path.join(img_folder, "temp.html")
            doc.SaveAs2(html_path, FileFormat=8)  # 8 = wdFormatHTML
            doc.Close(False)

            # Ищем все картинки в папке
            for file in os.listdir(img_folder):
                if file.lower().endswith(('.png', '.jpg', '.jpeg', '.gif', '.bmp')) and file != "temp.html":
                    old_path = os.path.join(img_folder, file)
                    new_name = f"image_{saved_count + 1}{os.path.splitext(file)[1]}"
                    new_path = os.path.join(img_folder, new_name)
                    os.rename(old_path, new_path)
                    saved_files.append(new_path)
                    saved_count += 1
                    print(f"✅ Найдено: {new_name}")

            # Удаляем HTML
            if os.path.exists(html_path):
                os.remove(html_path)

        except Exception as e:
            print(f"⚠️ HTML метод не сработал: {e}")
            doc.Close(False)

        # МЕТОД 2: Перебор InlineShapes
        if saved_count == 0:
            print("📄 Попытка через InlineShapes...")
            doc = word.Documents.Open(abs_path)

            for i, shape in enumerate(doc.InlineShapes):
                try:
                    # Проверяем тип
                    if shape.Type == 1:  # wdInlineShapePicture
                        # Простая картинка
                        shape.Select()
                        word.Selection.Copy()

                        # Сохраняем из буфера
                        img_path = os.path.join(img_folder, f"inline_{i + 1}.png")
                        with open(img_path, 'wb') as f:
                            # Здесь нужна дополнительная обработка буфера
                            pass

                except Exception as e:
                    print(f"⚠️ Ошибка InlineShape {i}: {e}")

        word.Quit()
        pythoncom.CoUninitialize()

        if saved_count > 0:
            print(f"\n🎉 Готово! Извлечено {saved_count} изображений.")
            print(f"📁 Папка: {img_folder}")
        else:
            print("\n⚠️ Изображения не найдены или не извлечены.")
            print("💡 Попробуйте открыть файл в Word и сохранить как HTML вручную.")

        return saved_files

    except Exception as e:
        print(f"❌ Критическая ошибка: {e}")
        if word:
            try:
                word.Quit()
            except:
                pass
        pythoncom.CoUninitialize()
        return []


if __name__ == "__main__":
    doc_file = r"C:\Users\Admin\laser-cut-backend\8мм.DOC"
    extract_images_from_doc(doc_file)