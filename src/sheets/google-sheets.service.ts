import { Injectable, Logger } from '@nestjs/common';
import { google } from 'googleapis';

@Injectable()
export class GoogleSheetsService {
    private readonly logger = new Logger(GoogleSheetsService.name);

    private getAuth(credentials: string) {
        const creds = JSON.parse(credentials);
        return new google.auth.GoogleAuth({
            credentials: {
                client_email: creds.client_email,
                private_key: creds.private_key,
            },
            scopes: ['https://www.googleapis.com/auth/spreadsheets'],
        });
    }

    private async getSheetsClient(credentials: string) {
        const auth = this.getAuth(credentials);
        const authClient = await auth.getClient();
        return google.sheets({ auth: authClient, version: 'v4' });
    }

    async appendData(
        sheetId: string,
        credentials: string,
        dataObjects: any[], // Array of objects
        worksheetName: string,
    ) {
        if (!dataObjects || dataObjects.length === 0) {
            this.logger.warn('No data provided to append.');
            return false;
        }

        try {
            const sheets = await this.getSheetsClient(credentials);

            // 1. Check if the worksheet exists
            const spreadsheet = await sheets.spreadsheets.get({
                spreadsheetId: sheetId,
            });
            const sheetExists = spreadsheet.data.sheets.some(
                (s) => s.properties.title === worksheetName,
            );

            const headers = Object.keys(dataObjects[0]);

            // 2. Create it if it doesn't exist, and add headers
            if (!sheetExists) {
                this.logger.log(`Worksheet "${worksheetName}" not found. Creating it...`);
                await sheets.spreadsheets.batchUpdate({
                    spreadsheetId: sheetId,
                    requestBody: {
                        requests: [
                            {
                                addSheet: {
                                    properties: { title: worksheetName },
                                },
                            },
                        ],
                    },
                });

                await sheets.spreadsheets.values.append({
                    spreadsheetId: sheetId,
                    range: `${worksheetName}!A1`,
                    valueInputOption: 'USER_ENTERED',
                    requestBody: {
                        values: [headers],
                    },
                });
            }

            // 3. Convert data and append
            const values = dataObjects.map((obj) => headers.map((header) => obj[header]));

            const result = await sheets.spreadsheets.values.append({
                spreadsheetId: sheetId,
                range: `${worksheetName}!A1`,
                valueInputOption: 'USER_ENTERED',
                requestBody: {
                    values: values,
                },
            });

            this.logger.log(
                `${result.data.updates.updatedCells} cells appended to "${worksheetName}".`,
            );
            return true;
        } catch (error) {
            this.logger.error('Failed to write to Google Sheets:', error);
            return false;
        }
    }
}
