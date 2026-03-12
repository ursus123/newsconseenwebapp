def load_summary(df, table_name):
    df.to_sql(table_name, engine, if_exists="replace", index=False)
