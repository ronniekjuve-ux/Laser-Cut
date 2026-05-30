import os
import win32com.client
import pythoncom


def extract_images_manual_method(doc_path):
    """Сохраняет документ как HTML и извлекает картинки"""
    try:
        word = win32com.client.Dispatch("Word.Application")
        word.Visible = False
        word.DisplayAlerts = 0

        doc = word.Documents.Open(os.path.abspath(doc_path))

        # Сохраняем как HTML
        output_dir = os.path.dirname(doc_path)
        html_path = os.path.join(output_dir, "temp_export.html")

        # FileFormat=8 это wdFormatHTML
        doc.SaveAs2(html_path, FileFormat=8)
        doc.Close(False)
        word.Quit()

        # Ищем папку с картинками
        base_name = os.path.splitext(os.path.basename(doc_path))[0]
        files_dir = os.path.join(output_dir, f"{base_name}_files")

        if os.path.exists(files_dir):
            print(f"✅ Изображения найдены в папке: {files_dir}")
            for f in os.listdir(files_dir):
                if f.lower().endswith(('.png', '.jpg', '.jpeg', '.gif')):
                    print(f"   📷 {f}")
        else:
            print("⚠️ Папка с изображениями не найдена")
            print(f"   Проверь: {output_dir}")

    except Exception as e:
        print(f"❌ Ошибка: {e}")


if __name__ == "__main__":
    extract_images_manual_method(r"C:\Users\Admin\laser-cut-backend\8мм.DOC")