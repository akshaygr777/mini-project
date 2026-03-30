import csv
import os

DATASET_FILE = 'asl_dataset.csv'

def delete_letter(target_letter):
    if not os.path.exists(DATASET_FILE):
        print(f"❌ Error: {DATASET_FILE} not found.")
        return

    kept_rows = []
    deleted_count = 0

    # Read the file and keep only the rows that DO NOT match the target letter
    with open(DATASET_FILE, 'r') as f:
        reader = csv.reader(f)
        for row in reader:
            if not row: 
                continue
            
            # row[0] is the letter label (e.g., 'A')
            if row[0] == target_letter:
                deleted_count += 1
            else:
                kept_rows.append(row)

    # Overwrite the original file with the cleaned data
    with open(DATASET_FILE, 'w', newline='') as f:
        writer = csv.writer(f)
        writer.writerows(kept_rows)

    print(f"✅ Deleted {deleted_count} samples of the letter '{target_letter}'.")
    print(f"📊 Total samples remaining in dataset: {len(kept_rows)}")

if __name__ == "__main__":
    print("--- ASL Dataset Cleanup ---")
    letter = input("Enter the letter you want to delete (A-Z): ").strip().upper()
    
    # Just a quick safety check
    if len(letter) == 1 and letter.isalpha():
        confirm = input(f"Are you sure you want to delete all '{letter}' samples? (y/n): ").strip().lower()
        if confirm == 'y':
            delete_letter(letter)
        else:
            print("Canceled.")
    else:
        print("Invalid input. Please enter a single letter.")