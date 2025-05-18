const csv = require('csv-parser');
const fs = require('fs');
const { MongoClient } = require('mongodb');

const uri = 'mongodb://localhost:27017';
const dbName = 'food';
const collectionName = 'fooditems';
const filePath = 'Meal_Planner_Dataset.csv'; // Path to your CSV file

async function insertCSVtoMongoDB() {
  const client = new MongoClient(uri, { useUnifiedTopology: true });
  const records = [];

  fs.createReadStream(filePath)
    .pipe(csv())
    .on('data', (row) => {
      const transformedRow = { ...row };

      // Rename Carbs (g) to Carbs
      if ('Carbs (g)' in transformedRow) {
        transformedRow.Carbs = parseFloat(transformedRow['Carbs (g)']) || 0;
        delete transformedRow['Carbs (g)'];
      }
      // Rename Protein (g) to Protein
      if ('Protein (g)' in transformedRow) {
        transformedRow.Protein = parseFloat(transformedRow['Protein (g)']) || 0;
        delete transformedRow['Protein (g)'];
      }
      // Rename Fat (g) to Fat
      if ('Fat (g)' in transformedRow) {
        transformedRow.Fat = parseFloat(transformedRow['Fat (g)']) || 0;
        delete transformedRow['Fat (g)'];
      }
      // Rename Meal Category to MealCategory
      if ('Meal Category' in transformedRow) {
        transformedRow.MealCategory = transformedRow['Meal Category'];
        delete transformedRow['Meal Category'];
      }
      // Rename Health Quotient to HealthQuotient
      if ('Health Quotient' in transformedRow) {
        transformedRow.HealthQuotient = transformedRow['Health Quotient'];
        delete transformedRow['Health Quotient'];
      }

      records.push(transformedRow);
    })
    .on('end', async () => {
      try {
        await client.connect();
        const db = client.db(dbName);
        const collection = db.collection(collectionName);

        if (records.length > 0) {
          const result = await collection.insertMany(records);
          console.log(`${result.insertedCount} documents inserted.`);
        } else {
          console.log('No data found in the CSV file.');
        }
      } catch (err) {
        console.error('Error inserting data:', err);
      } finally {
        await client.close();
      }
    });
}

insertCSVtoMongoDB();
